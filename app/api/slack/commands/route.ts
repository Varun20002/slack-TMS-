import { NextResponse } from "next/server";

import { slackApi, verifySlackSignature } from "@/lib/slack";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const DURATION_OPTIONS = [30, 60, 90, 120, 150, 180].map((value) => ({
  text: { type: "plain_text" as const, text: `${value} minutes` },
  value: String(value)
}));

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      endpoint: "/api/slack/commands",
      method: "POST"
    },
    { status: 200 }
  );
}

export async function POST(request: Request) {
  const t0 = Date.now();
  const rawBody = await request.text();
  const sigOk = verifySlackSignature(request, rawBody);

  // #region agent log
  console.error("[DBG-546f3a] entry", JSON.stringify({sigOk,hasSigningSecret:Boolean(process.env.SLACK_SIGNING_SECRET),hasBotToken:Boolean(process.env.SLACK_BOT_TOKEN),botTokenPrefix:(process.env.SLACK_BOT_TOKEN||'').slice(0,5),bodyLen:rawBody.length,host:request.headers.get('host')||null}));
  // #endregion

  if (!sigOk) {
    return NextResponse.json(
      {
        response_type: "ephemeral",
        text: "Slack signature check failed. Please verify SLACK_SIGNING_SECRET matches this Slack app."
      },
      { status: 200 }
    );
  }

  const form = new URLSearchParams(rawBody);
  const triggerId = form.get("trigger_id");
  const userId = form.get("user_id");
  const userName = form.get("user_name");
  const channelId = form.get("channel_id");
  const command = form.get("command");

  // #region agent log
  console.error("[DBG-546f3a] form_parsed", JSON.stringify({command,hasTriggerId:Boolean(triggerId),hasUserId:Boolean(userId),elapsedMs:Date.now()-t0}));
  // #endregion

  if (!triggerId || !userId) {
    return NextResponse.json({ ok: false, message: "Missing Slack trigger context." }, { status: 200 });
  }

  // Slack invalidates trigger_id after ~3s. views.open MUST run in this request before we
  // return — deferring with after() runs too late on serverless and the modal never opens.
  try {
    let trainerOptions: Array<{ text: { type: "plain_text"; text: string }; value: string }> = [];
    try {
      const supabase = createAdminClient() as any;
      const trainerQuery = supabase
        .from("trainers")
        .select("id, name")
        .order("name", { ascending: true })
        .limit(100);
      const timeoutMs = 1200;
      const { data: trainers } = await Promise.race([
        trainerQuery,
        new Promise<{ data: null }>((resolve) => setTimeout(() => resolve({ data: null }), timeoutMs))
      ]);
      trainerOptions = (trainers ?? []).map((trainer: { id: string; name: string }) => ({
        text: { type: "plain_text" as const, text: trainer.name.slice(0, 75) },
        value: trainer.id
      }));
    } catch (err) {
      console.error("Failed to preload trainer options for Slack modal", err);
    }

    // #region agent log
    console.error("[DBG-546f3a] before_views_open", JSON.stringify({trainerOptionCount:trainerOptions.length,elapsedMs:Date.now()-t0}));
    // #endregion

    const trainerElement =
      trainerOptions.length > 0
        ? {
            type: "static_select" as const,
            action_id: "trainer_id",
            placeholder: { type: "plain_text" as const, text: "Select trainer" },
            options: trainerOptions
          }
        : {
            type: "external_select" as const,
            action_id: "trainer_id",
            placeholder: { type: "plain_text" as const, text: "Search trainer" },
            min_query_length: 0
          };

    const viewsOpenStart = Date.now();
    let viewsOpenResult: any = null;
    let viewsOpenError: string | null = null;
    try {
      viewsOpenResult = await slackApi("/views.open", {
      trigger_id: triggerId,
      view: {
        type: "modal",
        callback_id: "webinar_schedule_modal",
        title: { type: "plain_text", text: "Schedule Webinar" },
        submit: { type: "plain_text", text: "Create" },
        close: { type: "plain_text", text: "Cancel" },
        private_metadata: JSON.stringify({
          slack_user_id: userId,
          slack_user_name: userName ?? "",
          channel_id: channelId ?? ""
        }),
        blocks: [
          // ── Section 1: Brief ─────────────────────────────────────────────
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
              placeholder: { type: "plain_text", text: "e.g. Growth, Product, BD" }
            }
          },
          {
            type: "input",
            block_id: "title_block",
            label: { type: "plain_text", text: "Webinar Name (as per campaign comms)" },
            element: {
              type: "plain_text_input",
              action_id: "title",
              placeholder: { type: "plain_text", text: "As it will appear in campaign materials" }
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
              placeholder: { type: "plain_text", text: "State goals and measurable metrics clearly" }
            }
          },
          {
            type: "input",
            block_id: "persona_block",
            label: { type: "plain_text", text: "What is the persona of your target group?" },
            element: {
              type: "plain_text_input",
              action_id: "persona",
              placeholder: { type: "plain_text", text: "e.g. First-time investors aged 25-35, NAP users" }
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
              placeholder: { type: "plain_text", text: "Describe current behaviour and the desired shift" }
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
              placeholder: { type: "plain_text", text: "The single key takeaway for attendees" }
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
              placeholder: { type: "plain_text", text: "List metrics you want to move" }
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
              placeholder: { type: "plain_text", text: "Words, phrases, concepts to use or avoid" }
            }
          },
          // ── Divider ───────────────────────────────────────────────────────
          { type: "divider" },
          // ── Section 2: Scheduling ─────────────────────────────────────────
          {
            type: "section",
            text: { type: "mrkdwn", text: "*🗓 Scheduling*" }
          },
          {
            type: "input",
            block_id: "trainer_block",
            dispatch_action: true,
            label: { type: "plain_text", text: "Trainer" },
            element: trainerElement
          },
          {
            type: "input",
            block_id: "date_block",
            dispatch_action: true,
            label: { type: "plain_text", text: "Webinar Date" },
            element: {
              type: "datepicker",
              action_id: "request_date",
              placeholder: { type: "plain_text", text: "Select date" },
              initial_date: new Date().toISOString().slice(0, 10)
            }
          },
          {
            type: "context",
            elements: [{ type: "mrkdwn", text: "Select trainer to see available weekdays." }]
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
              options: DURATION_OPTIONS
            }
          },
          {
            type: "input",
            block_id: "time_block",
            label: { type: "plain_text", text: "Available Timing (IST)" },
            element: {
              type: "static_select",
              action_id: "start_time",
              placeholder: { type: "plain_text", text: "Select trainer, date and duration first" },
              options: [{ text: { type: "plain_text", text: "No slots loaded yet" }, value: "__unavailable__" }]
            }
          }
        ]
      }
    });
    } catch (innerErr: any) {
      viewsOpenError = innerErr?.message || String(innerErr);
    }

    // #region agent log
    console.error("[DBG-546f3a] after_views_open", JSON.stringify({ok:viewsOpenResult?.ok??null,error:viewsOpenError,viewsOpenMs:Date.now()-viewsOpenStart,totalElapsedMs:Date.now()-t0}));
    // #endregion
  } catch (err: any) {
    // #region agent log
    console.error("[DBG-546f3a] outer_catch", JSON.stringify({error:err?.message||String(err),stack:(err?.stack||'').split('\n').slice(0,3).join(' | '),totalElapsedMs:Date.now()-t0}));
    // #endregion
  }

  return new NextResponse("", { status: 200 });
}
