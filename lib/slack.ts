import crypto from "crypto";

const SLACK_API_BASE = "https://slack.com/api";

function getSlackSigningSecret() {
  const value = process.env.SLACK_SIGNING_SECRET;
  if (!value) {
    throw new Error("Missing SLACK_SIGNING_SECRET.");
  }
  return value;
}

function getSlackBotToken() {
  const value = process.env.SLACK_BOT_TOKEN;
  if (!value) {
    throw new Error("Missing SLACK_BOT_TOKEN.");
  }
  return value;
}

export function verifySlackSignature(request: Request, rawBody: string) {
  const timestamp = request.headers.get("x-slack-request-timestamp");
  const signature = request.headers.get("x-slack-signature");
  if (!timestamp || !signature) return false;

  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - timestampNumber) > 60 * 5) return false;

  const sigBase = `v0:${timestamp}:${rawBody}`;
  const hmac = crypto.createHmac("sha256", getSlackSigningSecret()).update(sigBase).digest("hex");
  const expected = `v0=${hmac}`;

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function slackApi(path: string, payload: Record<string, unknown>, options?: { timeoutMs?: number }) {
  const token = getSlackBotToken();
  const timeoutMs = options?.timeoutMs ?? 8000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const response = await fetch(`${SLACK_API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload),
    signal: controller.signal
  }).finally(() => clearTimeout(timeout));

  const json = (await response.json()) as { ok: boolean; error?: string; response_metadata?: { messages?: string[] } };
  if (!json.ok) {
    // #region agent log
    console.error("[DBG-546f3a] slack_api_not_ok", JSON.stringify({path,error:json.error||null,messages:json.response_metadata?.messages||null,httpStatus:response.status}));
    // #endregion
    const msgs = json.response_metadata?.messages?.join(" | ");
    throw new Error(`${json.error || `Slack API error for ${path}`}${msgs ? ` :: ${msgs}` : ""}`);
  }
  return json;
}
