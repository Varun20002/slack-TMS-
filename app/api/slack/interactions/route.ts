import { revalidatePath } from "next/cache";
import { after, NextResponse } from "next/server";
import { z } from "zod";

import { slackApi, verifySlackSignature } from "@/lib/slack";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildGoogleCalendarEventUrl } from "@/lib/utils";

export const runtime = "nodejs";

type WebinarState = "RAISED" | "PENDING_APPROVAL" | "CONFIRMED" | "REJECTED" | "ALT_SUGGESTED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

const VALID_TRANSITIONS: Record<WebinarState, WebinarState[]> = {
  RAISED: ["PENDING_APPROVAL"],
  PENDING_APPROVAL: ["CONFIRMED", "REJECTED", "ALT_SUGGESTED"],
  ALT_SUGGESTED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  REJECTED: [],
  COMPLETED: [],
  CANCELLED: []
};

const CHECKLIST_KEYS = ["headshot", "bio", "deck", "promo_assets"] as const;

const slackWebinarSchema = z.object({
  title: z.string().min(3),
  trainer_id: z.string().min(1),
  webinar_timing_ts: z.coerce.number().int().positive(),
  attendees_est: z.coerce.number().int().min(0).default(0),
  duration_minutes: z.coerce.number().int().min(15).max(240).default(60),
  requirements: z.string().optional(),
  target_user_base: z.string().optional(),
  pre_webinar_link: z.string().optional(),
  post_webinar_link: z.string().optional()
});

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "/api/slack/interactions", method: "POST" }, { status: 200 });
}

function getInput(state: any, blockId: string, actionId: string) {
  return state?.[blockId]?.[actionId];
}

function combineDateTimeUtc(date: string, time: string) {
  const [h, m] = time.split(":").map(Number);
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCHours(h || 0, m || 0, 0, 0);
  return d.toISOString();
}

function normalizeUrl(url: string | undefined) {
  const value = (url ?? "").trim();
  if (!value) return null;
  try {
    new URL(value);
    return value;
  } catch {
    return null;
  }
}

function requireEnv(name: "BP_CHANNEL_ID" | "GROWTH_CHANNEL_ID" | "OPS_CHANNEL_ID") {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} in Vercel environment variables.`);
  return value;
}

function slackErrorField(path: string) {
  if (path === "title") return "title_block";
  if (path === "trainer_id") return "trainer_block";
  if (path === "webinar_timing_ts") return "timing_block";
  if (path === "attendees_est") return "attendees_block";
  if (path === "duration_minutes") return "duration_block";
  if (path === "requirements") return "requirements_block";
  if (path === "target_user_base") return "target_user_base_block";
  if (path === "pre_webinar_link") return "pre_link_block";
  if (path === "post_webinar_link") return "post_link_block";
  return "title_block";
}

function getMissingColumnName(error: unknown) {
  const parts: string[] = [];
  if (typeof error === "string") {
    parts.push(error);
  } else if (error && typeof error === "object") {
    const anyErr = error as Record<string, unknown>;
    for (const key of ["message", "details", "hint", "code"]) {
      const value = anyErr[key];
      if (typeof value === "string") parts.push(value);
    }
  }

  const joined = parts.join(" | ");
  const match = joined.match(/Could not find the '([^']+)' column/i) ?? joined.match(/column\s+["']?([a-zA-Z0-9_]+)["']?\s+does not exist/i);
  return match?.[1] ?? null;
}

function getRequestIdFromAction(payload: any) {
  return payload.actions?.[0]?.value as string | undefined;
}

function checklistLabel(key: string) {
  const map: Record<string, string> = {
    headshot: "Headshot",
    bio: "Bio",
    deck: "Deck",
    promo_assets: "Promo assets"
  };
  return map[key] ?? key;
}

function bpRequestCard(params: {
  requestId: string;
  topic: string;
  trainerName: string;
  requestedDate: string;
  attendees: number;
  employeeName: string;
}) {
  return [
    { type: "header", text: { type: "plain_text", text: "New webinar request", emoji: true } },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Topic*\n${params.topic}` },
        { type: "mrkdwn", text: `*Trainer*\n${params.trainerName}` },
        { type: "mrkdwn", text: `*Preferred time*\n${new Date(params.requestedDate).toUTCString()}` },
        { type: "mrkdwn", text: `*Est. attendees*\n${params.attendees}` },
        { type: "mrkdwn", text: `*Requested by*\n${params.employeeName}` },
        { type: "mrkdwn", text: `*Request ID*\n\`${params.requestId}\`` }
      ]
    },
    {
      type: "actions",
      block_id: `bp_actions_${params.requestId}`,
      elements: [
        { type: "button", text: { type: "plain_text", text: "Confirm" }, style: "primary", action_id: "bp_confirm", value: params.requestId },
        { type: "button", text: { type: "plain_text", text: "Reject" }, style: "danger", action_id: "bp_reject", value: params.requestId },
        { type: "button", text: { type: "plain_text", text: "Suggest alternative" }, action_id: "bp_suggest_alt", value: params.requestId }
      ]
    }
  ];
}

function employeeAltDecisionBlocks(requestId: string) {
  return [
    {
      type: "section",
      text: { type: "mrkdwn", text: "Please confirm or decline the proposed alternative date." }
    },
    {
      type: "actions",
      block_id: `emp_alt_${requestId}`,
      elements: [
        { type: "button", text: { type: "plain_text", text: "Accept new date" }, style: "primary", action_id: "employee_accept_alt", value: requestId },
        { type: "button", text: { type: "plain_text", text: "Decline" }, action_id: "employee_decline_alt", value: requestId }
      ]
    }
  ];
}

function growthChecklistBlocks(requestRow: any, items: Array<{ item: string; completed: boolean; updated_by: string | null }>) {
  const byItem = new Map(items.map((item) => [item.item, item]));
  const elements = CHECKLIST_KEYS.map((key) => {
    const row = byItem.get(key);
    return {
      type: "button",
      text: { type: "plain_text", text: `${row?.completed ? "✅" : "⬜"} ${checklistLabel(key)}` },
      action_id: `growth_toggle_checklist_${key}`,
      value: `${requestRow.id}|${key}`
    };
  });
  const allDone = CHECKLIST_KEYS.every((key) => byItem.get(key)?.completed);
  elements.push({
    type: "button",
    text: { type: "plain_text", text: "Mark complete" },
    ...(allDone ? { style: "primary" as const } : {}),
    action_id: "growth_mark_complete",
    value: requestRow.id
  });

  return [
    { type: "header", text: { type: "plain_text", text: "Webinar content checklist", emoji: true } },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Topic*\n${requestRow.topic}` },
        { type: "mrkdwn", text: `*Trainer*\n${requestRow.trainer_name}` },
        { type: "mrkdwn", text: `*Scheduled*\n${new Date(requestRow.requested_date).toUTCString()}` },
        { type: "mrkdwn", text: `*Est. attendees*\n${requestRow.attendees_est}` },
        { type: "mrkdwn", text: `*Request ID*\n\`${requestRow.id}\`` }
      ]
    },
    {
      type: "actions",
      block_id: `growth_cl_${requestRow.id}`,
      elements
    }
  ];
}

async function dmUser(userId: string, text: string, blocks?: any[]) {
  try {
    const open = (await slackApi("/conversations.open", { users: userId })) as any;
    const channel = open.channel?.id;
    if (channel) {
      await slackApi("/chat.postMessage", { channel, text, ...(blocks ? { blocks } : {}) });
    }
  } catch {
    return;
  }
}

async function transitionRequest(params: {
  supabase: any;
  requestId: string;
  toState: WebinarState;
  actorId: string;
  actorName: string;
  action: string;
  metadata?: Record<string, unknown>;
  columnUpdates?: Record<string, unknown>;
}) {
  const { supabase, requestId, toState, actorId, actorName, action, metadata = {}, columnUpdates = {} } = params;
  const { data: row, error } = await supabase.from("webinar_requests").select("state").eq("id", requestId).maybeSingle();
  if (error || !row) throw new Error(error?.message ?? "Request not found.");
  const fromState = row.state as WebinarState;
  if (!VALID_TRANSITIONS[fromState]?.includes(toState)) {
    throw new Error(`Invalid transition: ${fromState} -> ${toState}`);
  }

  const { error: updateError } = await supabase
    .from("webinar_requests")
    .update({ state: toState, ...columnUpdates, updated_at: new Date().toISOString() })
    .eq("id", requestId);
  if (updateError) throw new Error(updateError.message);

  await supabase.from("audit_log").insert({
    request_id: requestId,
    actor_id: actorId,
    actor_name: actorName,
    from_state: fromState,
    to_state: toState,
    action,
    metadata
  });
}

async function upsertWebinarForRequest(supabase: any, requestRow: any, actor: { id: string; name: string }) {
  const { data: submitAudit } = await supabase
    .from("audit_log")
    .select("metadata")
    .eq("request_id", requestRow.id)
    .eq("action", "submit_slack_webinar_request")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const metadata = (submitAudit?.metadata ?? {}) as Record<string, unknown>;
  const trainerId = typeof metadata.trainer_id === "string" ? metadata.trainer_id : null;
  if (!trainerId) return;

  const durationMinutes = Number(metadata.duration_minutes ?? 60) || 60;
  const start = new Date(requestRow.requested_date);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  const googleLink = buildGoogleCalendarEventUrl({
    title: requestRow.topic,
    description: (metadata.requirements as string) || (metadata.target_user_base as string) || "",
    start,
    end
  });

  const payload: Record<string, unknown> = {
    trainer_id: trainerId,
    source_request_id: requestRow.id,
    slack_requester_id: requestRow.employee_slack_id,
    slack_requester_name: requestRow.employee_name,
    title: requestRow.topic,
    webinar_timing: requestRow.requested_date,
    duration_minutes: durationMinutes,
    requirements: (metadata.requirements as string) || null,
    target_user_base: (metadata.target_user_base as string) || null,
    pre_webinar_link: normalizeUrl(metadata.pre_webinar_link as string),
    post_webinar_link: normalizeUrl(metadata.post_webinar_link as string),
    google_calendar_embed_url: googleLink,
    status: requestRow.state === "COMPLETED" ? "completed" : requestRow.state === "CANCELLED" || requestRow.state === "REJECTED" ? "cancelled" : "upcoming"
  };

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data, error } = await supabase.from("webinars").insert(payload).select("id").single();
    if (!error && data?.id) {
      await supabase.from("webinar_metrics").upsert({
        webinar_id: data.id,
        registrations_count: 0,
        attendees_count: 0,
        first_time_future_traders_count: 0,
        rating: null,
        highest_audience_count: null,
        success_rate: null
      });
      return;
    }

    const missingColumn = getMissingColumnName(error);
    if (missingColumn && missingColumn in payload) {
      delete payload[missingColumn];
      continue;
    }
    break;
  }

  await dmUser(actor.id, "Could not create webinar record after confirmation. Please check DB schema for `webinars`.");
}

async function ensureChecklistAndPostToGrowth(params: { supabase: any; requestId: string; actorId: string; actorName: string }) {
  const { supabase, requestId, actorId, actorName } = params;
  const { count } = await supabase.from("content_checklist").select("id", { count: "exact", head: true }).eq("request_id", requestId);
  if (!count) {
    const rows = CHECKLIST_KEYS.map((item) => ({ request_id: requestId, item, completed: false }));
    await supabase.from("content_checklist").insert(rows);
  }

  await transitionRequest({
    supabase,
    requestId,
    toState: "IN_PROGRESS",
    actorId,
    actorName,
    action: "growth_checklist_started"
  });

  const { data: req } = await supabase.from("webinar_requests").select("*").eq("id", requestId).maybeSingle();
  if (!req) return;
  const { data: items } = await supabase.from("content_checklist").select("item, completed, updated_by").eq("request_id", requestId);

  const post = (await slackApi("/chat.postMessage", {
    channel: requireEnv("GROWTH_CHANNEL_ID"),
    text: `Content checklist: ${req.topic}`,
    blocks: growthChecklistBlocks(req, items ?? [])
  })) as any;

  if (post.channel && post.ts) {
    await supabase.from("webinar_requests").update({ growth_channel_id: post.channel, growth_message_ts: post.ts }).eq("id", requestId);
  }
}

function rejectReasonModal(requestId: string) {
  return {
    type: "modal",
    callback_id: "bp_reject_modal",
    private_metadata: requestId,
    title: { type: "plain_text", text: "Reject request" },
    submit: { type: "plain_text", text: "Reject" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      {
        type: "input",
        block_id: "reason",
        label: { type: "plain_text", text: "Reason" },
        element: { type: "plain_text_input", action_id: "val", multiline: true }
      }
    ]
  };
}

function altDateModal(requestId: string) {
  return {
    type: "modal",
    callback_id: "bp_alt_modal",
    private_metadata: requestId,
    title: { type: "plain_text", text: "Suggest alternative time" },
    submit: { type: "plain_text", text: "Submit" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      { type: "input", block_id: "alt_date", label: { type: "plain_text", text: "New date" }, element: { type: "datepicker", action_id: "val" } },
      { type: "input", block_id: "alt_time", label: { type: "plain_text", text: "New time (UTC)" }, element: { type: "timepicker", action_id: "val" } }
    ]
  };
}

async function handleScheduleSubmitData(payload: any) {
  const state = payload.view?.state?.values;
  const collected = {
    title: getInput(state, "title_block", "title")?.value ?? "",
    trainer_id: getInput(state, "trainer_block", "trainer_id")?.selected_option?.value ?? "",
    webinar_timing_ts: getInput(state, "timing_block", "webinar_timing_ts")?.selected_date_time ?? "",
    attendees_est: getInput(state, "attendees_block", "attendees_est")?.value ?? "0",
    duration_minutes: getInput(state, "duration_block", "duration_minutes")?.value ?? "60",
    requirements: getInput(state, "requirements_block", "requirements")?.value ?? "",
    target_user_base: getInput(state, "target_user_base_block", "target_user_base")?.value ?? "",
    pre_webinar_link: getInput(state, "pre_link_block", "pre_webinar_link")?.value ?? "",
    post_webinar_link: getInput(state, "post_link_block", "post_webinar_link")?.value ?? ""
  };

  return collected;
}

function scheduleConfirmModal(data: z.infer<typeof slackWebinarSchema>, trainerName: string) {
  const when = new Date(data.webinar_timing_ts * 1000).toUTCString();
  return {
    type: "modal",
    callback_id: "webinar_schedule_confirm_modal",
    private_metadata: JSON.stringify(data),
    title: { type: "plain_text", text: "Confirm Request" },
    submit: { type: "plain_text", text: "Confirm" },
    close: { type: "plain_text", text: "Back" },
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: "*Please confirm before sending to BP team.*" }
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Title*\n${data.title}` },
          { type: "mrkdwn", text: `*Trainer*\n${trainerName}` },
          { type: "mrkdwn", text: `*Start (UTC)*\n${when}` },
          { type: "mrkdwn", text: `*Expected attendees*\n${data.attendees_est}` },
          { type: "mrkdwn", text: `*Duration*\n${data.duration_minutes} min` },
          { type: "mrkdwn", text: `*Target user base*\n${data.target_user_base || "-"}` }
        ]
      }
    ]
  };
}

async function handleScheduleConfirmed(payload: any, parsed: z.infer<typeof slackWebinarSchema>) {
  const actorId = payload.user?.id ?? "unknown";
  try {
    const supabase = createAdminClient() as any;
    const startIso = new Date(parsed.webinar_timing_ts * 1000).toISOString();
    const { data: trainer } = await supabase.from("trainers").select("id, name").eq("id", parsed.trainer_id).maybeSingle();
    if (!trainer) {
      await dmUser(actorId, "Request submission failed: trainer not found.");
      return { response_action: "clear" };
    }

    const actorName = payload.user?.username ?? payload.user?.name ?? "Slack User";
    const { data: requestRow, error } = await supabase
      .from("webinar_requests")
      .insert({
        topic: parsed.title,
        trainer_name: trainer.name,
        requested_date: startIso,
        attendees_est: parsed.attendees_est,
        state: "RAISED",
        employee_slack_id: actorId,
        employee_name: actorName
      })
      .select("*")
      .single();

    if (error || !requestRow) {
      await dmUser(actorId, `Request submission failed: ${error?.message ?? "Unknown error"}`);
      return { response_action: "clear" };
    }

    await transitionRequest({
      supabase,
      requestId: requestRow.id,
      toState: "PENDING_APPROVAL",
      actorId,
      actorName,
      action: "submit_slack_webinar_request",
      metadata: {
        trainer_id: trainer.id,
        requirements: parsed.requirements || null,
        target_user_base: parsed.target_user_base || null,
        pre_webinar_link: normalizeUrl(parsed.pre_webinar_link),
        post_webinar_link: normalizeUrl(parsed.post_webinar_link),
        duration_minutes: parsed.duration_minutes
      }
    });

    const posted = (await slackApi("/chat.postMessage", {
      channel: requireEnv("BP_CHANNEL_ID"),
      text: `Webinar request: ${requestRow.topic}`,
      blocks: bpRequestCard({
        requestId: requestRow.id,
        topic: requestRow.topic,
        trainerName: requestRow.trainer_name,
        requestedDate: requestRow.requested_date,
        attendees: requestRow.attendees_est,
        employeeName: requestRow.employee_name
      })
    })) as any;

    if (posted.channel && posted.ts) {
      await supabase.from("webinar_requests").update({ bp_channel_id: posted.channel, bp_message_ts: posted.ts }).eq("id", requestRow.id);
    }

    await dmUser(actorId, `Your webinar request *${requestRow.topic}* is submitted and pending BP review.`);
  } catch (error) {
    await dmUser(actorId, `Request submission failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
  return { response_action: "clear" };
}

async function handleScheduleSubmit(payload: any) {
  const supabase = createAdminClient() as any;
  const collected = await handleScheduleSubmitData(payload);
  const parsed = slackWebinarSchema.safeParse(collected);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = slackErrorField(String(issue?.path?.[0] ?? ""));
    return {
      response_action: "errors",
      errors: {
        [field]: issue?.message ?? "Invalid payload"
      }
    };
  }

  const { data: trainer } = await supabase.from("trainers").select("id, name").eq("id", parsed.data.trainer_id).maybeSingle();
  if (!trainer) {
    return {
      response_action: "errors",
      errors: { trainer_block: "Trainer not found." }
    };
  }

  return { response_action: "update", view: scheduleConfirmModal(parsed.data, trainer.name) };
}

async function handleBpConfirm(payload: any) {
  const requestId = getRequestIdFromAction(payload);
  if (!requestId) return;
  const actorId = payload.user?.id ?? "unknown";
  const actorName = payload.user?.username ?? payload.user?.name ?? "Slack User";
  const supabase = createAdminClient() as any;

  await transitionRequest({
    supabase,
    requestId,
    toState: "CONFIRMED",
    actorId,
    actorName,
    action: "bp_confirm",
    columnUpdates: { bp_slack_id: actorId }
  });

  const { data: req } = await supabase.from("webinar_requests").select("*").eq("id", requestId).maybeSingle();
  if (!req) return;

  await upsertWebinarForRequest(supabase, req, { id: actorId, name: actorName });

  if (req.bp_channel_id && req.bp_message_ts) {
    await slackApi("/chat.update", {
      channel: req.bp_channel_id,
      ts: req.bp_message_ts,
      text: `Confirmed: ${req.topic}`,
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: `✅ *Confirmed* by ${actorName}. Growth team has been notified.` }
        }
      ]
    });
  }

  await dmUser(req.employee_slack_id, `Your webinar request *${req.topic}* was confirmed. Growth team has been notified.`);
  await ensureChecklistAndPostToGrowth({ supabase, requestId, actorId, actorName });
}

async function handleBpRejectSubmit(payload: any) {
  const requestId = payload.view?.private_metadata as string;
  const reason = payload.view?.state?.values?.reason?.val?.value?.trim() ?? "";
  if (!reason) {
    return { response_action: "errors", errors: { reason: "Please provide a reason." } };
  }

  const actorId = payload.user?.id ?? "unknown";
  const actorName = payload.user?.username ?? payload.user?.name ?? "Slack User";
  const supabase = createAdminClient() as any;

  await transitionRequest({
    supabase,
    requestId,
    toState: "REJECTED",
    actorId,
    actorName,
    action: "bp_reject",
    metadata: { reason },
    columnUpdates: { bp_slack_id: actorId, rejection_reason: reason }
  });

  const { data: req } = await supabase.from("webinar_requests").select("*").eq("id", requestId).maybeSingle();
  if (!req) return { response_action: "clear" };

  if (req.bp_channel_id && req.bp_message_ts) {
    await slackApi("/chat.update", {
      channel: req.bp_channel_id,
      ts: req.bp_message_ts,
      text: `Rejected: ${req.topic}`,
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: `❌ *Rejected* by ${actorName}\n*Reason:* ${reason}` }
        }
      ]
    });
  }

  await dmUser(req.employee_slack_id, `Your webinar request *${req.topic}* was rejected.\nReason: ${reason}`);
  return { response_action: "clear" };
}

async function handleBpAltSubmit(payload: any) {
  const requestId = payload.view?.private_metadata as string;
  const altDate = payload.view?.state?.values?.alt_date?.val?.selected_date ?? "";
  const altTime = payload.view?.state?.values?.alt_time?.val?.selected_time ?? "";
  if (!altDate || !altTime) {
    return {
      response_action: "errors",
      errors: { ...(altDate ? {} : { alt_date: "Required" }), ...(altTime ? {} : { alt_time: "Required" }) }
    };
  }

  const altIso = combineDateTimeUtc(altDate, altTime);
  const actorId = payload.user?.id ?? "unknown";
  const actorName = payload.user?.username ?? payload.user?.name ?? "Slack User";
  const supabase = createAdminClient() as any;

  await transitionRequest({
    supabase,
    requestId,
    toState: "ALT_SUGGESTED",
    actorId,
    actorName,
    action: "bp_suggest_alternative",
    metadata: { alt_date: altIso },
    columnUpdates: { bp_slack_id: actorId, alt_date: altIso }
  });

  const { data: req } = await supabase.from("webinar_requests").select("*").eq("id", requestId).maybeSingle();
  if (!req) return { response_action: "clear" };

  if (req.bp_channel_id && req.bp_message_ts) {
    await slackApi("/chat.update", {
      channel: req.bp_channel_id,
      ts: req.bp_message_ts,
      text: `Alternative suggested: ${req.topic}`,
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: `📅 *Alternative suggested* by ${actorName}\n*Proposed time:* ${new Date(altIso).toUTCString()}` }
        }
      ]
    });
  }

  await dmUser(
    req.employee_slack_id,
    `BP suggested a new time for *${req.topic}* (${new Date(altIso).toUTCString()}).`,
    employeeAltDecisionBlocks(requestId)
  );
  return { response_action: "clear" };
}

async function handleEmployeeAcceptAlt(payload: any) {
  const requestId = getRequestIdFromAction(payload);
  if (!requestId) return;
  const actorId = payload.user?.id ?? "unknown";
  const actorName = payload.user?.username ?? payload.user?.name ?? "Slack User";
  const supabase = createAdminClient() as any;

  const { data: req } = await supabase.from("webinar_requests").select("*").eq("id", requestId).maybeSingle();
  if (!req || req.employee_slack_id !== actorId || !req.alt_date) return;

  await transitionRequest({
    supabase,
    requestId,
    toState: "CONFIRMED",
    actorId,
    actorName,
    action: "employee_accept_alternative",
    metadata: { requested_date: req.alt_date },
    columnUpdates: { requested_date: req.alt_date }
  });

  const { data: refreshed } = await supabase.from("webinar_requests").select("*").eq("id", requestId).maybeSingle();
  if (!refreshed) return;
  await upsertWebinarForRequest(supabase, refreshed, { id: actorId, name: actorName });

  if (refreshed.bp_channel_id && refreshed.bp_message_ts) {
    await slackApi("/chat.update", {
      channel: refreshed.bp_channel_id,
      ts: refreshed.bp_message_ts,
      text: `Confirmed (alt accepted): ${refreshed.topic}`,
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: `✅ Employee accepted alternative time.\n*${refreshed.topic}* is now *CONFIRMED*.` }
        }
      ]
    });
  }

  await dmUser(actorId, `You accepted the new time for *${refreshed.topic}*.`);
  await ensureChecklistAndPostToGrowth({ supabase, requestId, actorId, actorName });
}

async function handleEmployeeDeclineAlt(payload: any) {
  const requestId = getRequestIdFromAction(payload);
  if (!requestId) return;
  const actorId = payload.user?.id ?? "unknown";
  const actorName = payload.user?.username ?? payload.user?.name ?? "Slack User";
  const supabase = createAdminClient() as any;

  const { data: req } = await supabase.from("webinar_requests").select("*").eq("id", requestId).maybeSingle();
  if (!req || req.employee_slack_id !== actorId) return;

  await transitionRequest({
    supabase,
    requestId,
    toState: "CANCELLED",
    actorId,
    actorName,
    action: "employee_decline_alternative"
  });

  if (req.bp_channel_id && req.bp_message_ts) {
    await slackApi("/chat.update", {
      channel: req.bp_channel_id,
      ts: req.bp_message_ts,
      text: `Cancelled: ${req.topic}`,
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: `🚫 Employee declined the alternative.\n*${req.topic}* → *CANCELLED*.` }
        }
      ]
    });
  }

  await dmUser(actorId, `You declined the alternative time for *${req.topic}*. Request cancelled.`);
}

async function handleGrowthToggle(payload: any) {
  const raw = getRequestIdFromAction(payload);
  if (!raw) return;
  const [requestId, item] = raw.split("|");
  if (!requestId || !item) return;

  const supabase = createAdminClient() as any;
  const { data: req } = await supabase.from("webinar_requests").select("*").eq("id", requestId).maybeSingle();
  if (!req || req.state !== "IN_PROGRESS" || !req.growth_channel_id || !req.growth_message_ts) return;

  const { data: current } = await supabase.from("content_checklist").select("id, completed").eq("request_id", requestId).eq("item", item).maybeSingle();
  if (!current?.id) return;

  await supabase.from("content_checklist").update({
    completed: !current.completed,
    updated_by: payload.user?.id ?? null,
    updated_at: new Date().toISOString()
  }).eq("id", current.id);

  await supabase.from("webinar_requests").update({ growth_slack_id: payload.user?.id ?? null }).eq("id", requestId);
  const { data: items } = await supabase.from("content_checklist").select("item, completed, updated_by").eq("request_id", requestId);

  await slackApi("/chat.update", {
    channel: req.growth_channel_id,
    ts: req.growth_message_ts,
    text: `Content checklist: ${req.topic}`,
    blocks: growthChecklistBlocks(req, items ?? [])
  });
}

async function handleGrowthComplete(payload: any) {
  const requestId = getRequestIdFromAction(payload);
  if (!requestId) return;
  const actorId = payload.user?.id ?? "unknown";
  const actorName = payload.user?.username ?? payload.user?.name ?? "Slack User";
  const supabase = createAdminClient() as any;

  const { data: req } = await supabase.from("webinar_requests").select("*").eq("id", requestId).maybeSingle();
  if (!req || req.state !== "IN_PROGRESS") return;

  const { data: items } = await supabase.from("content_checklist").select("item, completed").eq("request_id", requestId);
  const incomplete = (items ?? []).filter((item: any) => !item.completed);
  if (incomplete.length) {
    await slackApi("/chat.postEphemeral", {
      channel: req.growth_channel_id ?? requireEnv("GROWTH_CHANNEL_ID"),
      user: actorId,
      text: `Complete all checklist items first (${incomplete.map((item: any) => item.item).join(", ")} remaining).`
    });
    return;
  }

  await transitionRequest({
    supabase,
    requestId,
    toState: "COMPLETED",
    actorId,
    actorName,
    action: "growth_mark_complete",
    columnUpdates: { growth_slack_id: actorId }
  });

  if (req.growth_channel_id && req.growth_message_ts) {
    await slackApi("/chat.update", {
      channel: req.growth_channel_id,
      ts: req.growth_message_ts,
      text: `Completed: ${req.topic}`,
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: `✅ *Content complete* — *${req.topic}*\nMarked complete by <@${actorId}>.` }
        }
      ]
    });
  }

  await slackApi("/chat.postMessage", {
    channel: requireEnv("OPS_CHANNEL_ID"),
    text: `Webinar request completed: ${req.topic}`
  });
}

function scheduleRevalidation() {
  revalidatePath("/admin/webinars");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/calendar");
  revalidatePath("/trainer/dashboard");
  revalidatePath("/trainer/webinars");
  revalidatePath("/trainer/calendar");
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!verifySlackSignature(request, rawBody)) {
    return NextResponse.json({ error: "Invalid Slack signature" }, { status: 401 });
  }

  const form = new URLSearchParams(rawBody);
  const payloadRaw = form.get("payload");
  if (!payloadRaw) return NextResponse.json({ ok: false }, { status: 200 });
  const payload = JSON.parse(payloadRaw) as any;

  if (payload.type === "block_suggestion") {
    const actionId = payload.action_id ?? payload.action?.action_id ?? payload.actions?.[0]?.action_id ?? null;
    const blockId = payload.block_id ?? payload.action?.block_id ?? payload.actions?.[0]?.block_id ?? null;
    if (actionId !== "trainer_id" && blockId !== "trainer_block") {
      return NextResponse.json({ options: [] }, { status: 200 });
    }

    const supabase = createAdminClient() as any;
    const query = (payload.value ?? "").trim();
    let trainerQuery = supabase.from("trainers").select("id, name").order("name", { ascending: true }).limit(100);
    if (query.length) trainerQuery = trainerQuery.ilike("name", `%${query}%`);
    const { data: trainers } = await trainerQuery;
    const options = (trainers ?? []).map((trainer: { id: string; name: string }) => ({
      text: { type: "plain_text", text: trainer.name.slice(0, 75) },
      value: trainer.id
    }));
    return NextResponse.json({ options }, { status: 200 });
  }

  if (payload.type === "view_submission") {
    const callbackId = payload.view?.callback_id;
    if (callbackId === "webinar_schedule_modal") {
      const response = await handleScheduleSubmit(payload);
      after(scheduleRevalidation);
      return NextResponse.json(response, { status: 200 });
    }
    if (callbackId === "webinar_schedule_confirm_modal") {
      let parsed: z.infer<typeof slackWebinarSchema> | null = null;
      try {
        parsed = slackWebinarSchema.parse(JSON.parse(payload.view?.private_metadata ?? "{}"));
      } catch {
        parsed = null;
      }
      if (!parsed) {
        return NextResponse.json({ response_action: "clear" }, { status: 200 });
      }
      const response = await handleScheduleConfirmed(payload, parsed);
      after(scheduleRevalidation);
      return NextResponse.json(response, { status: 200 });
    }
    if (callbackId === "bp_reject_modal") {
      const response = await handleBpRejectSubmit(payload);
      after(scheduleRevalidation);
      return NextResponse.json(response, { status: 200 });
    }
    if (callbackId === "bp_alt_modal") {
      const response = await handleBpAltSubmit(payload);
      after(scheduleRevalidation);
      return NextResponse.json(response, { status: 200 });
    }
    return NextResponse.json({ response_action: "clear" }, { status: 200 });
  }

  if (payload.type === "block_actions") {
    const actionId = payload.actions?.[0]?.action_id as string | undefined;
    if (!actionId) return NextResponse.json({ ok: true }, { status: 200 });

    if (actionId === "bp_reject") {
      return NextResponse.json({ response_action: "push", view: rejectReasonModal(getRequestIdFromAction(payload) ?? "") }, { status: 200 });
    }
    if (actionId === "bp_suggest_alt") {
      return NextResponse.json({ response_action: "push", view: altDateModal(getRequestIdFromAction(payload) ?? "") }, { status: 200 });
    }

    after(async () => {
      try {
        if (actionId === "bp_confirm") await handleBpConfirm(payload);
        else if (actionId === "employee_accept_alt") await handleEmployeeAcceptAlt(payload);
        else if (actionId === "employee_decline_alt") await handleEmployeeDeclineAlt(payload);
        else if (actionId.startsWith("growth_toggle_checklist_")) await handleGrowthToggle(payload);
        else if (actionId === "growth_mark_complete") await handleGrowthComplete(payload);
        scheduleRevalidation();
      } catch (error) {
        await dmUser(payload.user?.id ?? "", `Action failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
