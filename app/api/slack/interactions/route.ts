import { revalidatePath } from "next/cache";
import { after, NextResponse } from "next/server";
import { z } from "zod";

import { createGoogleCalendarEvent, decryptRefreshToken, refreshGoogleAccessToken, updateGoogleCalendarEvent } from "@/lib/google-calendar";
import { slackApi, verifySlackSignature } from "@/lib/slack";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildGoogleCalendarEventUrl, formatDate } from "@/lib/utils";

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

const CHECKLIST_KEYS = ["received_pic", "creatives_made", "campaigns_done"] as const;
const DURATION_VALUES = [30, 60, 90, 120, 150, 180] as const;
const NO_SLOT_VALUE = "__no_slot__";
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const slackWebinarSchema = z.object({
  // Brief fields
  dri_team: z.string().min(1, "DRI team is required."),
  title: z.string().min(3, "Webinar name must be at least 3 characters."),
  goals: z.string().min(1, "Goals are required."),
  persona: z.string().min(1, "Persona is required."),
  behaviour: z.string().optional(),
  core_message: z.string().min(1, "Core message is required."),
  metrics: z.string().min(1, "Metrics are required."),
  // Scheduling fields
  trainer_id: z.string().min(1),
  request_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  duration_minutes: z.coerce.number().int().refine((v) => DURATION_VALUES.includes(v as any), { message: "Duration must be between 30 and 180 minutes." }),
  // dos_donts stored under existing `requirements` key for backward compat
  requirements: z.string().min(1, "Do's and Don'ts are required.")
});

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "/api/slack/interactions", method: "POST" }, { status: 200 });
}

function getInput(state: any, blockId: string, actionId: string) {
  return state?.[blockId]?.[actionId];
}

function combineDateTimeUtc(date: string, time: string) {
  return new Date(`${date}T${time}:00+05:30`).toISOString();
}

function combineDateTimeIst(date: string, time: string) {
  return new Date(`${date}T${time}:00+05:30`).toISOString();
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
  if (path === "dri_team") return "dri_team_block";
  if (path === "title") return "title_block";
  if (path === "goals") return "goals_block";
  if (path === "persona") return "persona_block";
  if (path === "behaviour") return "behaviour_block";
  if (path === "core_message") return "core_message_block";
  if (path === "metrics") return "metrics_block";
  if (path === "requirements") return "dos_donts_block";
  if (path === "trainer_id") return "trainer_block";
  if (path === "request_date") return "date_block";
  if (path === "start_time") return "time_block";
  if (path === "duration_minutes") return "duration_block";
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
    received_pic: "Received the picture",
    creatives_made: "Creatives made",
    campaigns_done: "Campaigns done"
  };
  return map[key] ?? key;
}

function bpRequestCard(params: {
  requestId: string;
  topic: string;
  trainerName: string;
  requestedDate: string;
  employeeName: string;
  driTeam?: string;
  goals?: string;
  metrics?: string;
}) {
  return [
    { type: "header", text: { type: "plain_text", text: "New webinar request", emoji: true } },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Webinar Name*\n${params.topic}` },
        { type: "mrkdwn", text: `*Trainer*\n${params.trainerName}` },
        { type: "mrkdwn", text: `*Preferred time*\n${formatDate(params.requestedDate)}` },
        { type: "mrkdwn", text: `*Requested by*\n${params.employeeName}` },
        { type: "mrkdwn", text: `*DRI Team*\n${params.driTeam ?? "—"}` }
      ]
    },
    ...(params.goals
      ? [{ type: "section", text: { type: "mrkdwn", text: `*Goals*\n${params.goals}` } }]
      : []),
    ...(params.metrics
      ? [{ type: "section", text: { type: "mrkdwn", text: `*Metrics to Drive*\n${params.metrics}` } }]
      : []),
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: `Request ID: \`${params.requestId}\`` }]
    },
    {
      type: "actions",
      block_id: `bp_actions_${params.requestId}`,
      elements: [
        { type: "button", text: { type: "plain_text", text: "Confirm" }, style: "primary", action_id: "bp_confirm", value: params.requestId },
        { type: "button", text: { type: "plain_text", text: "Decline" }, style: "danger", action_id: "bp_reject", value: params.requestId },
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
    { type: "header", text: { type: "plain_text", text: "Growth check list", emoji: true } },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Topic*\n${requestRow.topic}` },
        { type: "mrkdwn", text: `*Trainer*\n${requestRow.trainer_name}` },
        { type: "mrkdwn", text: `*Scheduled*\n${formatDate(requestRow.requested_date)}` },
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

async function resolveActionMessageContext(payload: any) {
  const channelId = payload.container?.channel_id ?? payload.channel?.id;
  const messageTs = payload.container?.message_ts ?? payload.message?.ts;
  return { channelId, messageTs };
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
    status: requestRow.state === "CANCELLED" || requestRow.state === "REJECTED" ? "cancelled" : "upcoming"
  };

  let webinarId: string | null = null;

  const { data: existing } = await supabase.from("webinars").select("id").eq("source_request_id", requestRow.id).maybeSingle();
  if (existing?.id) {
    webinarId = existing.id;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const { error } = await supabase.from("webinars").update(payload).eq("id", existing.id);
      if (!error) break;
      const missingColumn = getMissingColumnName(error);
      if (missingColumn && missingColumn in payload) {
        delete payload[missingColumn];
        continue;
      }
      break;
    }
  } else {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const { data, error } = await supabase.from("webinars").insert(payload).select("id").single();
      if (!error && data?.id) {
        webinarId = data.id;
        break;
      }
      const missingColumn = getMissingColumnName(error);
      if (missingColumn && missingColumn in payload) {
        delete payload[missingColumn];
        continue;
      }
      break;
    }
  }

  if (!webinarId) {
    await dmUser(actor.id, "Could not create webinar record after confirmation. Please check DB schema for `webinars`.");
    return;
  }

  await supabase.from("webinar_metrics").upsert({
    webinar_id: webinarId,
    registrations_count: 0,
    attendees_count: 0,
    first_time_future_traders_count: 0,
    rating: null,
    highest_audience_count: null,
    success_rate: null
  });

  await syncGoogleEventForSlackWebinar(supabase, {
    webinarId,
    trainerId,
    title: requestRow.topic,
    startIso: requestRow.requested_date,
    durationMinutes,
    requirements: (metadata.requirements as string) || null,
    targetUserBase: (metadata.target_user_base as string) || null,
    preWebinarLink: normalizeUrl(metadata.pre_webinar_link as string),
    postWebinarLink: normalizeUrl(metadata.post_webinar_link as string)
  });
}

async function syncGoogleEventForSlackWebinar(
  supabase: any,
  input: {
    webinarId: string;
    trainerId: string;
    title: string;
    startIso: string;
    durationMinutes: number;
    requirements: string | null;
    targetUserBase: string | null;
    preWebinarLink: string | null;
    postWebinarLink: string | null;
  }
) {
  const { data: webinar } = await supabase
    .from("webinars")
    .select("id, google_event_id")
    .eq("id", input.webinarId)
    .maybeSingle();
  if (!webinar?.id) return;

  const { data: connection } = await supabase
    .from("trainer_google_connections")
    .select("encrypted_refresh_token, calendar_id")
    .eq("trainer_id", input.trainerId)
    .maybeSingle();

  if (!connection?.encrypted_refresh_token) {
    await supabase
      .from("webinars")
      .update({
        google_event_id: null,
        google_calendar_sync_error: "Trainer has not connected Google Calendar.",
        updated_at: new Date().toISOString()
      })
      .eq("id", input.webinarId);
    return;
  }

  try {
    const refreshToken = decryptRefreshToken(connection.encrypted_refresh_token);
    const accessToken = await refreshGoogleAccessToken(refreshToken);
    const start = new Date(input.startIso);
    const end = new Date(start.getTime() + input.durationMinutes * 60 * 1000);
    const description = [
      input.requirements ? `Requirements: ${input.requirements}` : null,
      input.targetUserBase ? `Target user base: ${input.targetUserBase}` : null,
      input.preWebinarLink ? `Pre-webinar link: ${input.preWebinarLink}` : null,
      input.postWebinarLink ? `Post-webinar link: ${input.postWebinarLink}` : null
    ]
      .filter(Boolean)
      .join("\n");

    let eventId = webinar.google_event_id as string | null;
    if (eventId) {
      await updateGoogleCalendarEvent(accessToken, {
        calendarId: connection.calendar_id || "primary",
        eventId,
        title: input.title,
        description,
        startIso: start.toISOString(),
        endIso: end.toISOString()
      });
    } else {
      eventId = await createGoogleCalendarEvent(accessToken, {
        calendarId: connection.calendar_id || "primary",
        title: input.title,
        description,
        startIso: start.toISOString(),
        endIso: end.toISOString()
      });
    }

    await supabase
      .from("webinars")
      .update({
        google_event_id: eventId,
        google_calendar_sync_error: null,
        updated_at: new Date().toISOString()
      })
      .eq("id", input.webinarId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Calendar sync failed.";
    await supabase
      .from("webinars")
      .update({
        google_event_id: null,
        google_calendar_sync_error: message,
        updated_at: new Date().toISOString()
      })
      .eq("id", input.webinarId);
  }
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
    title: { type: "plain_text", text: "Decline request" },
    submit: { type: "plain_text", text: "Decline" },
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
      { type: "input", block_id: "alt_time", label: { type: "plain_text", text: "New time" }, element: { type: "timepicker", action_id: "val" } }
    ]
  };
}

type ScheduleDraft = {
  // Brief
  dri_team: string;
  title: string;
  goals: string;
  persona: string;
  behaviour: string;
  core_message: string;
  metrics: string;
  // Scheduling
  trainer_id: string;
  request_date: string;
  duration_minutes: string;
  start_time: string;
  requirements: string;
};

type TrainerPreview = {
  name: string;
  imageUrl: string | null;
  bioText: string;
};

function durationOptions() {
  return DURATION_VALUES.map((value) => ({
    text: { type: "plain_text" as const, text: `${value} minutes` },
    value: String(value)
  }));
}

function parseTimeToMinutes(input: string) {
  const [h, m] = input.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTimeLabel(totalMinutes: number) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function dayOfWeekFromDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return new Date(date).getDay();
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

async function buildTrainerOptions(supabase: any) {
  const { data: trainers } = await supabase.from("trainers").select("id, name").order("name", { ascending: true }).limit(100);
  return (trainers ?? []).map((trainer: { id: string; name: string }) => ({
    text: { type: "plain_text" as const, text: trainer.name.slice(0, 75) },
    value: trainer.id
  }));
}

function truncate(text: string, max = 220) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

async function buildTrainerPreview(supabase: any, trainerId: string): Promise<TrainerPreview | null> {
  if (!trainerId) return null;
  const { data: trainer } = await supabase
    .from("trainers")
    .select("name, experience, investing_trading_persona, strengths, credentials_or_claim_to_fame, profile_image_url")
    .eq("id", trainerId)
    .maybeSingle();
  if (!trainer) return null;

  const parts = [
    typeof trainer.experience === "number" ? `${trainer.experience} yrs exp` : null,
    trainer.investing_trading_persona ? `Persona: ${trainer.investing_trading_persona}` : null,
    trainer.strengths ? `Strengths: ${trainer.strengths}` : null,
    trainer.credentials_or_claim_to_fame ? `Credentials: ${trainer.credentials_or_claim_to_fame}` : null
  ]
    .filter(Boolean)
    .join(" • ");

  return {
    name: trainer.name,
    imageUrl: trainer.profile_image_url || null,
    bioText: truncate(parts || "No bio details available yet.", 280)
  };
}

async function buildAvailableTimeOptions(supabase: any, trainerId: string, requestDate: string, durationMinutes: number) {
  if (!trainerId || !requestDate || !durationMinutes) {
    return [{ text: { type: "plain_text" as const, text: "Select trainer, date and duration first" }, value: NO_SLOT_VALUE }];
  }

  const dayOfWeek = dayOfWeekFromDate(requestDate);
  const [{ data: rows }, { data: webinarRows }] = await Promise.all([
    supabase
      .from("trainer_availability")
      .select("start_time,end_time")
      .eq("trainer_id", trainerId)
      .eq("day_of_week", dayOfWeek)
      .order("start_time", { ascending: true }),
    supabase
      .from("webinars")
      .select("webinar_timing, duration_minutes")
      .eq("trainer_id", trainerId)
      .neq("status", "cancelled")
      .gte("webinar_timing", `${requestDate}T00:00:00`)
      .lt("webinar_timing", `${requestDate}T23:59:59`)
  ]);

  const bookedRanges: Array<{ start: number; end: number }> = [];
  for (const w of webinarRows ?? []) {
    const dt = new Date(w.webinar_timing);
    const wStart = dt.getHours() * 60 + dt.getMinutes();
    const wEnd = wStart + (w.duration_minutes ?? 60);
    bookedRanges.push({ start: wStart, end: wEnd });
  }

  function overlapsBooked(slotStart: number, slotEnd: number) {
    return bookedRanges.some((b) => slotStart < b.end && slotEnd > b.start);
  }

  const options: Array<{ text: { type: "plain_text"; text: string }; value: string }> = [];
  for (const row of rows ?? []) {
    const start = parseTimeToMinutes(String(row.start_time).slice(0, 5));
    const end = parseTimeToMinutes(String(row.end_time).slice(0, 5));
    for (let cursor = start; cursor + durationMinutes <= end; cursor += 30) {
      if (overlapsBooked(cursor, cursor + durationMinutes)) continue;
      const label = minutesToTimeLabel(cursor);
      options.push({ text: { type: "plain_text", text: label }, value: label });
    }
  }

  if (!options.length) {
    return [{ text: { type: "plain_text" as const, text: "No slots available for selected date/duration" }, value: NO_SLOT_VALUE }];
  }
  return options;
}

async function buildAvailabilityHint(supabase: any, trainerId: string, requestDate: string, hasSlots: boolean) {
  if (!trainerId) return "Select trainer to see available weekdays.";
  const { data: rows } = await supabase.from("trainer_availability").select("day_of_week").eq("trainer_id", trainerId);
  const dayList = (rows ?? []).map((row: { day_of_week: number }) => row.day_of_week) as number[];
  const uniqueDays = [...new Set(dayList)].sort((a, b) => a - b);
  if (!uniqueDays.length) return "Trainer has no availability slots configured yet.";

  const dayLabels = uniqueDays.map((day) => WEEKDAY_LABELS[day] ?? "").filter(Boolean).join(", ");
  if (!requestDate) return `Trainer available on: ${dayLabels}`;

  const selectedDay = dayOfWeekFromDate(requestDate);
  if (!uniqueDays.includes(selectedDay)) {
    return `Trainer available on: ${dayLabels}. Selected date is unavailable.`;
  }
  if (!hasSlots) {
    return `Trainer available on: ${dayLabels}. Selected date has no slot for chosen duration.`;
  }
  return `Trainer available on: ${dayLabels}.`;
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function formatCalDate(d: Date) {
  return `${WEEKDAY_LABELS[d.getDay()]} ${String(d.getDate()).padStart(2, "0")} ${MONTH_LABELS[d.getMonth()]}`;
}

function formatDateRange(start: Date, end: Date) {
  return `${String(start.getDate()).padStart(2, "0")} ${MONTH_LABELS[start.getMonth()]} – ${String(end.getDate()).padStart(2, "0")} ${MONTH_LABELS[end.getMonth()]}`;
}

async function buildAvailabilityCalendar(
  supabase: any,
  trainerId: string,
  trainerName: string,
  weekOffset: number
): Promise<any[]> {
  if (!trainerId) return [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() + weekOffset * 7);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 7);

  const [{ data: availRows }, { data: webinarRows }] = await Promise.all([
    supabase
      .from("trainer_availability")
      .select("day_of_week, start_time, end_time")
      .eq("trainer_id", trainerId)
      .order("start_time", { ascending: true }),
    supabase
      .from("webinars")
      .select("title, webinar_timing, duration_minutes, status")
      .eq("trainer_id", trainerId)
      .neq("status", "cancelled")
      .gte("webinar_timing", startDate.toISOString())
      .lt("webinar_timing", endDate.toISOString())
      .order("webinar_timing", { ascending: true })
  ]);

  const availByDay = new Map<number, Array<{ start: string; end: string }>>();
  for (const row of availRows ?? []) {
    const day = row.day_of_week as number;
    if (!availByDay.has(day)) availByDay.set(day, []);
    availByDay.get(day)!.push({
      start: String(row.start_time).slice(0, 5),
      end: String(row.end_time).slice(0, 5)
    });
  }

  const webinarsByDate = new Map<string, Array<{ title: string; start: string; end: string }>>();
  for (const w of webinarRows ?? []) {
    const dt = new Date(w.webinar_timing);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    if (!webinarsByDate.has(key)) webinarsByDate.set(key, []);
    const startMin = dt.getHours() * 60 + dt.getMinutes();
    const endMin = startMin + (w.duration_minutes ?? 60);
    webinarsByDate.get(key)!.push({
      title: (w.title ?? "").slice(0, 20),
      start: minutesToTimeLabel(startMin),
      end: minutesToTimeLabel(endMin)
    });
  }

  const lines: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const dow = d.getDay();
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const dayLabel = formatCalDate(d);
    const slots = availByDay.get(dow) ?? [];
    const booked = webinarsByDate.get(dateKey) ?? [];

    if (!slots.length && !booked.length) {
      lines.push(`*${dayLabel}*  _No availability_`);
      continue;
    }

    const parts: string[] = [];
    for (const s of slots) {
      parts.push(`🟩 ${s.start}–${s.end}`);
    }
    for (const b of booked) {
      parts.push(`🔴 ${b.start}–${b.end} ${b.title}`);
    }
    lines.push(`*${dayLabel}*  ${parts.join("  ")}`);
  }

  const lastDay = new Date(startDate);
  lastDay.setDate(lastDay.getDate() + 6);

  return [
    {
      type: "section",
      text: { type: "mrkdwn", text: `*📅  ${trainerName} — ${formatDateRange(startDate, lastDay)}*` }
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: lines.join("\n") }
    },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: "🟩 Available    🔴 Booked" }]
    }
  ];
}

function getScheduleDraft(payload: any): ScheduleDraft {
  const state = payload.view?.state?.values;
  return {
    // Brief
    dri_team: getInput(state, "dri_team_block", "dri_team")?.value ?? "",
    title: getInput(state, "title_block", "title")?.value ?? "",
    goals: getInput(state, "goals_block", "goals")?.value ?? "",
    persona: getInput(state, "persona_block", "persona")?.value ?? "",
    behaviour: getInput(state, "behaviour_block", "behaviour")?.value ?? "",
    core_message: getInput(state, "core_message_block", "core_message")?.value ?? "",
    metrics: getInput(state, "metrics_block", "metrics")?.value ?? "",
    // Scheduling
    trainer_id: getInput(state, "trainer_block", "trainer_id")?.selected_option?.value ?? "",
    request_date: getInput(state, "date_block", "request_date")?.selected_date ?? "",
    duration_minutes: getInput(state, "duration_block", "duration_minutes")?.selected_option?.value ?? "",
    start_time: getInput(state, "time_block", "start_time")?.selected_option?.value ?? "",
    requirements: getInput(state, "dos_donts_block", "requirements")?.value ?? ""
  };
}

function buildScheduleModal(params: {
  draft: ScheduleDraft;
  trainerOptions: Array<{ text: { type: "plain_text"; text: string }; value: string }>;
  timeOptions: Array<{ text: { type: "plain_text"; text: string }; value: string }>;
  availabilityHint: string;
  privateMetadata: string;
  trainerPreview: TrainerPreview | null;
  calendarBlocks?: any[];
}) {
  const { draft, trainerOptions, timeOptions, availabilityHint, privateMetadata, trainerPreview, calendarBlocks = [] } = params;
  const selectedDuration = durationOptions().find((opt) => opt.value === draft.duration_minutes);
  const selectedTrainer = trainerOptions.find((opt) => opt.value === draft.trainer_id);
  const selectedStartTime = timeOptions.find((opt) => opt.value === draft.start_time);

  return {
    type: "modal",
    callback_id: "webinar_schedule_modal",
    title: { type: "plain_text", text: "Schedule Webinar" },
    submit: { type: "plain_text", text: "Create" },
    close: { type: "plain_text", text: "Cancel" },
    private_metadata: privateMetadata,
    blocks: [
      // ── Section 1: Brief ─────────────────────────────────────────────────
      {
        type: "section",
        text: { type: "mrkdwn", text: "*📋 Request Brief*" }
      },
      {
        type: "input",
        block_id: "dri_team_block",
        label: { type: "plain_text", text: "Which Team does the DRI belong to?" },
        element: {
          type: "plain_text_input",
          action_id: "dri_team",
          placeholder: { type: "plain_text", text: "e.g. Growth, Product, BD" },
          ...(draft.dri_team ? { initial_value: draft.dri_team } : {})
        }
      },
      {
        type: "input",
        block_id: "title_block",
        label: { type: "plain_text", text: "Webinar Name (as per campaign comms)" },
        element: {
          type: "plain_text_input",
          action_id: "title",
          placeholder: { type: "plain_text", text: "As it will appear in campaign materials" },
          ...(draft.title ? { initial_value: draft.title } : {})
        }
      },
      {
        type: "input",
        block_id: "goals_block",
        label: { type: "plain_text", text: "What Goals is this webinar helping to achieve?" },
        hint: { type: "plain_text", text: "Include clear metrics. Requests without metrics may be deprioritised." },
        element: {
          type: "plain_text_input",
          action_id: "goals",
          multiline: true,
          placeholder: { type: "plain_text", text: "State goals and measurable metrics clearly" },
          ...(draft.goals ? { initial_value: draft.goals } : {})
        }
      },
      {
        type: "input",
        block_id: "persona_block",
        label: { type: "plain_text", text: "What is the persona of your target group?" },
        element: {
          type: "plain_text_input",
          action_id: "persona",
          placeholder: { type: "plain_text", text: "e.g. First-time investors aged 25-35, NAP users" },
          ...(draft.persona ? { initial_value: draft.persona } : {})
        }
      },
      {
        type: "input",
        block_id: "behaviour_block",
        optional: true,
        label: { type: "plain_text", text: "How is the target group behaving today, and what behavioural change signals success?" },
        element: {
          type: "plain_text_input",
          action_id: "behaviour",
          multiline: true,
          placeholder: { type: "plain_text", text: "Describe current behaviour and the desired shift" },
          ...(draft.behaviour ? { initial_value: draft.behaviour } : {})
        }
      },
      {
        type: "input",
        block_id: "core_message_block",
        label: { type: "plain_text", text: "What is the core message you are trying to convey?" },
        element: {
          type: "plain_text_input",
          action_id: "core_message",
          multiline: true,
          placeholder: { type: "plain_text", text: "The single key takeaway for attendees" },
          ...(draft.core_message ? { initial_value: draft.core_message } : {})
        }
      },
      {
        type: "input",
        block_id: "metrics_block",
        label: { type: "plain_text", text: "What metrics are you trying to drive with this webinar?" },
        hint: { type: "plain_text", text: "e.g. UNAP, FNAP, NAP, No of API users, Volume" },
        element: {
          type: "plain_text_input",
          action_id: "metrics",
          placeholder: { type: "plain_text", text: "List metrics you want to move" },
          ...(draft.metrics ? { initial_value: draft.metrics } : {})
        }
      },
      {
        type: "input",
        block_id: "dos_donts_block",
        label: { type: "plain_text", text: "Critical Do's and Don'ts for the trainer" },
        element: {
          type: "plain_text_input",
          action_id: "requirements",
          multiline: true,
          placeholder: { type: "plain_text", text: "Words, phrases, concepts to use or avoid" },
          ...(draft.requirements ? { initial_value: draft.requirements } : {})
        }
      },
      // ── Divider ────────────────────────────────────────────────────────────
      { type: "divider" },
      // ── Section 2: Scheduling ──────────────────────────────────────────────
      {
        type: "section",
        text: { type: "mrkdwn", text: "*🗓 Scheduling*" }
      },
      {
        type: "input",
        block_id: "trainer_block",
        dispatch_action: true,
        label: { type: "plain_text", text: "Trainer" },
        element: {
          type: "static_select",
          action_id: "trainer_id",
          placeholder: { type: "plain_text", text: "Select trainer" },
          options: trainerOptions,
          ...(selectedTrainer ? { initial_option: selectedTrainer } : {})
        }
      },
      ...(trainerPreview
        ? [
            ...(trainerPreview.imageUrl
              ? [
                  {
                    type: "image",
                    image_url: trainerPreview.imageUrl,
                    alt_text: `${trainerPreview.name} profile photo`
                  }
                ]
              : []),
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*${trainerPreview.name}* \n${trainerPreview.bioText}`
              }
            }
          ]
        : [
            {
              type: "context",
              elements: [{ type: "mrkdwn", text: "Select a trainer to view profile preview." }]
            }
          ]),
      ...calendarBlocks,
      {
        type: "input",
        block_id: "date_block",
        dispatch_action: true,
        label: { type: "plain_text", text: "Webinar Date" },
        element: {
          type: "datepicker",
          action_id: "request_date",
          placeholder: { type: "plain_text", text: "Select date" },
          ...(draft.request_date ? { initial_date: draft.request_date } : {})
        }
      },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: availabilityHint }]
      },
      {
        type: "input",
        block_id: "duration_block",
        dispatch_action: true,
        label: { type: "plain_text", text: "Duration" },
        element: {
          type: "static_select",
          action_id: "duration_minutes",
          placeholder: { type: "plain_text", text: "Select duration" },
          options: durationOptions(),
          ...(selectedDuration ? { initial_option: selectedDuration } : {})
        }
      },
      {
        type: "input",
        block_id: "time_block",
        label: { type: "plain_text", text: "Available Timing (IST)" },
        element: {
          type: "static_select",
          action_id: "start_time",
          placeholder: { type: "plain_text", text: "Select start time" },
          options: timeOptions,
          ...(selectedStartTime ? { initial_option: selectedStartTime } : {})
        }
      },
    ]
  };
}

async function handleScheduleSubmitData(payload: any) {
  const collected = getScheduleDraft(payload);
  const durationValue = Number(collected.duration_minutes || 0);
  return {
    // Brief
    dri_team: collected.dri_team,
    title: collected.title,
    goals: collected.goals,
    persona: collected.persona,
    behaviour: collected.behaviour,
    core_message: collected.core_message,
    metrics: collected.metrics,
    // Scheduling
    trainer_id: collected.trainer_id,
    request_date: collected.request_date,
    start_time: collected.start_time,
    duration_minutes: durationValue,
    requirements: collected.requirements
  };
}

function scheduleConfirmModal(data: z.infer<typeof slackWebinarSchema>, trainerName: string) {
  const when = formatDate(combineDateTimeIst(data.request_date, data.start_time));
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
        text: { type: "mrkdwn", text: "*Please review all details before sending to the BP team.*" }
      },
      { type: "divider" },
      {
        type: "section",
        text: { type: "mrkdwn", text: "*📋 Request Brief*" }
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*DRI Team*\n${data.dri_team}` },
          { type: "mrkdwn", text: `*Webinar Name*\n${data.title}` }
        ]
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*Goals*\n${data.goals}` }
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Persona*\n${data.persona}` },
          { type: "mrkdwn", text: `*Metrics to Drive*\n${data.metrics}` }
        ]
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*Core Message*\n${data.core_message}` }
      },
      ...(data.behaviour
        ? [{ type: "section", text: { type: "mrkdwn", text: `*Behavioural Change*\n${data.behaviour}` } }]
        : []),
      {
        type: "section",
        text: { type: "mrkdwn", text: `*Do's and Don'ts*\n${data.requirements}` }
      },
      { type: "divider" },
      {
        type: "section",
        text: { type: "mrkdwn", text: "*🗓 Scheduling*" }
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Trainer*\n${trainerName}` },
          { type: "mrkdwn", text: `*Start*\n${when}` },
          { type: "mrkdwn", text: `*Duration*\n${data.duration_minutes} min` }
        ]
      }
    ]
  };
}

async function handleScheduleConfirmed(payload: any, parsed: z.infer<typeof slackWebinarSchema>) {
  const actorId = payload.user?.id ?? "unknown";
  try {
    const supabase = createAdminClient() as any;
    const startIso = combineDateTimeIst(parsed.request_date, parsed.start_time);
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
        attendees_est: 0,
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
        duration_minutes: parsed.duration_minutes,
        // Brief fields
        dri_team: parsed.dri_team,
        goals: parsed.goals,
        persona: parsed.persona,
        behaviour: parsed.behaviour || null,
        core_message: parsed.core_message,
        metrics: parsed.metrics,
        // dos_donts stored as requirements for webinar record compat
        requirements: parsed.requirements || null,
        target_user_base: parsed.persona || null
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
        employeeName: requestRow.employee_name,
        driTeam: parsed.dri_team,
        goals: parsed.goals,
        metrics: parsed.metrics
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
  if (collected.start_time === NO_SLOT_VALUE) {
    return {
      response_action: "errors",
      errors: { time_block: "Select a valid available timing." }
    };
  }
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

  const availableOptions = await buildAvailableTimeOptions(
    supabase,
    parsed.data.trainer_id,
    parsed.data.request_date,
    parsed.data.duration_minutes
  );
  const hasAvailableSlots = availableOptions.some((option) => option.value !== NO_SLOT_VALUE);
  if (!hasAvailableSlots) {
    return {
      response_action: "errors",
      errors: {
        date_block: "Trainer is unavailable on selected date for chosen duration.",
        time_block: "No available timing for this date and duration."
      }
    };
  }
  const startTimeValid = availableOptions.some((option) => option.value === parsed.data.start_time);
  if (!startTimeValid) {
    return {
      response_action: "errors",
      errors: {
        time_block: "Please choose a valid available timing."
      }
    };
  }

  return { response_action: "update", view: scheduleConfirmModal(parsed.data, trainer.name) };
}

async function handleScheduleModalBlockAction(payload: any) {
  const callbackId = payload.view?.callback_id;
  if (callbackId !== "webinar_schedule_modal") return false;

  const actionId = payload.actions?.[0]?.action_id as string | undefined;
  const KNOWN_ACTIONS = ["trainer_id", "request_date", "duration_minutes", "start_time", "cal_nav_prev", "cal_nav_next"];
  if (!actionId || !KNOWN_ACTIONS.includes(actionId)) return false;

  const supabase = createAdminClient() as any;
  const draft = getScheduleDraft(payload);
  const trainerOptions = await buildTrainerOptions(supabase);
  const trainerPreview = await buildTrainerPreview(supabase, draft.trainer_id);
  const durationMinutes = Number(draft.duration_minutes || 0);
  const timeOptions = await buildAvailableTimeOptions(supabase, draft.trainer_id, draft.request_date, durationMinutes);
  const hasSlots = timeOptions.some((option) => option.value !== NO_SLOT_VALUE);
  const availabilityHint = await buildAvailabilityHint(supabase, draft.trainer_id, draft.request_date, hasSlots);

  let weekOffset = 0;
  if (actionId === "cal_nav_prev" || actionId === "cal_nav_next") {
    weekOffset = Number(payload.actions[0].value ?? 0);
  }

  if ((actionId === "trainer_id" || actionId === "request_date") && draft.start_time) {
    draft.start_time = "";
  } else if (!["start_time", "cal_nav_prev", "cal_nav_next"].includes(actionId) && draft.start_time) {
    const stillValid = timeOptions.some((option) => option.value === draft.start_time);
    if (!stillValid) draft.start_time = "";
  }

  const trainerName = trainerOptions.find((o: any) => o.value === draft.trainer_id)?.text?.text ?? "";
  const calendarBlocks = await buildAvailabilityCalendar(supabase, draft.trainer_id, trainerName, weekOffset);

  const modalView = buildScheduleModal({
    draft,
    trainerOptions,
    timeOptions,
    availabilityHint,
    privateMetadata: payload.view.private_metadata ?? "{}",
    trainerPreview,
    calendarBlocks
  });

  try {
    const result = await slackApi("/views.update", {
      view_id: payload.view.id,
      hash: payload.view.hash,
      view: modalView
    });
    // #region agent log
    console.log("[DEBUG-546f3a] RESULT", { actionId, calBlocks: calendarBlocks.length, totalBlocks: modalView?.blocks?.length, ok: result?.ok });
    // #endregion
  } catch (err: any) {
    // #region agent log
    console.log("[DEBUG-546f3a] FAILED", { actionId, calBlocks: calendarBlocks.length, error: err?.message ?? String(err) });
    // #endregion
    if (err?.message === "hash_conflict") {
      try {
        await slackApi("/views.update", { view_id: payload.view.id, view: modalView });
      } catch (_) {}
    }
  }

  return true;
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
      text: `Declined: ${req.topic}`,
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: `❌ *Declined* by ${actorName}\n*Reason:* ${reason}` }
        }
      ]
    });
  }

  await dmUser(req.employee_slack_id, `Your webinar request *${req.topic}* was declined.\nReason: ${reason}`);
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
          text: { type: "mrkdwn", text: `📅 *Alternative suggested* by ${actorName}\n*Proposed time:* ${formatDate(altIso)}` }
        }
      ]
    });
  }

  await dmUser(
    req.employee_slack_id,
    `BP suggested a new time for *${req.topic}* (${formatDate(altIso)}).`,
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
  const ctx = await resolveActionMessageContext(payload);
  if (ctx.channelId && ctx.messageTs) {
    await slackApi("/chat.update", {
      channel: ctx.channelId,
      ts: ctx.messageTs,
      text: `Accepted alternative date for ${refreshed.topic}`,
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: `✅ You accepted the new date for *${refreshed.topic}*.` }
        }
      ]
    });
  }
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
  const ctx = await resolveActionMessageContext(payload);
  if (ctx.channelId && ctx.messageTs) {
    await slackApi("/chat.update", {
      channel: ctx.channelId,
      ts: ctx.messageTs,
      text: `Declined alternative date for ${req.topic}`,
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: `🚫 You declined the alternative date for *${req.topic}*.` }
        }
      ]
    });
  }
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

  const { data: refreshed } = await supabase.from("webinar_requests").select("*").eq("id", requestId).maybeSingle();
  if (refreshed) {
    await upsertWebinarForRequest(supabase, refreshed, { id: actorId, name: actorName });
  }

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
      after(async () => {
        await handleScheduleConfirmed(payload, parsed as z.infer<typeof slackWebinarSchema>);
        scheduleRevalidation();
      });
      return NextResponse.json({ response_action: "clear" }, { status: 200 });
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
    const handledScheduleModal = await handleScheduleModalBlockAction(payload);
    if (handledScheduleModal) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const actionId = payload.actions?.[0]?.action_id as string | undefined;
    if (!actionId) return NextResponse.json({ ok: true }, { status: 200 });

    if (actionId === "bp_reject" || actionId === "bp_suggest_alt") {
      const triggerId = payload.trigger_id as string | undefined;
      const requestId = getRequestIdFromAction(payload) ?? "";
      if (!triggerId || !requestId) return NextResponse.json({ ok: true }, { status: 200 });

      const view = actionId === "bp_reject" ? rejectReasonModal(requestId) : altDateModal(requestId);
      await slackApi("/views.open", { trigger_id: triggerId, view });
      return NextResponse.json({ ok: true }, { status: 200 });
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
