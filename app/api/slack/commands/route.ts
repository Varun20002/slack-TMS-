import { after } from "next/server";
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
  const rawBody = await request.text();

  if (!verifySlackSignature(request, rawBody)) {
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

  if (!triggerId || !userId) {
    return NextResponse.json({ ok: false, message: "Missing Slack trigger context." }, { status: 200 });
  }

  // Open the modal in the background so we reply to Slack within 3 s.
  after(async () => {
    try {
      let trainerOptions: Array<{ text: { type: "plain_text"; text: string }; value: string }> = [];
      try {
        const supabase = createAdminClient() as any;
        const { data: trainers } = await supabase
          .from("trainers")
          .select("id, name")
          .order("name", { ascending: true })
          .limit(100);
        trainerOptions = (trainers ?? []).map((trainer: { id: string; name: string }) => ({
          text: { type: "plain_text" as const, text: trainer.name.slice(0, 75) },
          value: trainer.id
        }));
      } catch (err) {
        console.error("Failed to preload trainer options for Slack modal", err);
      }

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

      await slackApi("/views.open", {
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
            {
              type: "input",
              block_id: "title_block",
              label: { type: "plain_text", text: "Title" },
              element: {
                type: "plain_text_input",
                action_id: "title",
                placeholder: { type: "plain_text", text: "Webinar title" }
              }
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
                placeholder: { type: "plain_text", text: "Select date" }
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
              label: { type: "plain_text", text: "Available Timing" },
              element: {
                type: "static_select",
                action_id: "start_time",
                placeholder: { type: "plain_text", text: "Select trainer, date and duration first" },
                options: [{ text: { type: "plain_text", text: "No slots loaded yet" }, value: "__unavailable__" }]
              }
            },
            {
              type: "input",
              block_id: "attendees_block",
              optional: true,
              label: { type: "plain_text", text: "Expected Attendees" },
              element: {
                type: "plain_text_input",
                action_id: "attendees_est",
                placeholder: { type: "plain_text", text: "e.g. 120" }
              }
            },
            {
              type: "input",
              block_id: "requirements_block",
              optional: true,
              label: { type: "plain_text", text: "Requirements" },
              element: { type: "plain_text_input", action_id: "requirements", multiline: true }
            },
            {
              type: "input",
              block_id: "target_user_base_block",
              optional: true,
              label: { type: "plain_text", text: "Target User Base" },
              element: { type: "plain_text_input", action_id: "target_user_base" }
            }
          ]
        }
      });
    } catch (err) {
      console.error("Failed to open Slack scheduling modal", err);
    }
  });

  // Acknowledge Slack immediately (must be within 3 s).
  return new NextResponse("", { status: 200 });
}
