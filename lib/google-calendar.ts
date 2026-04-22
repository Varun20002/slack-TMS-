import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const GOOGLE_OAUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const GOOGLE_CALENDAR_BASE = "https://www.googleapis.com/calendar/v3";
const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

type GoogleEnv = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  encryptionKey: Buffer;
};

function getAppBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.startsWith("http") ? configured : `https://${configured}`;
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

function getEncryptionKey() {
  const raw = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error("Missing GOOGLE_TOKEN_ENCRYPTION_KEY. Use a 32-byte base64 key in .env.");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length === 32) return key;
  return createHash("sha256").update(raw).digest();
}

function getGoogleEnv(): GoogleEnv {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim() ?? `${getAppBaseUrl()}/api/google/calendar/callback`;
  if (!clientId || !clientSecret) {
    throw new Error("Missing GOOGLE_OAUTH_CLIENT_ID or GOOGLE_OAUTH_CLIENT_SECRET.");
  }
  return { clientId, clientSecret, redirectUri, encryptionKey: getEncryptionKey() };
}

export function buildGoogleCalendarAuthUrl(state: string) {
  const { clientId, redirectUri } = getGoogleEnv();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: `openid email profile ${GOOGLE_CALENDAR_SCOPE}`,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state
  });
  return `${GOOGLE_OAUTH_URL}?${params.toString()}`;
}

export function encryptRefreshToken(refreshToken: string) {
  const { encryptionKey } = getGoogleEnv();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(refreshToken, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${authTag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptRefreshToken(payload: string) {
  const { encryptionKey } = getGoogleEnv();
  const parts = payload.split(".");
  if (parts.length !== 3) throw new Error("Invalid encrypted token format.");
  const [ivPart, authTagPart, encryptedPart] = parts;
  const iv = Buffer.from(ivPart, "base64url");
  const authTag = Buffer.from(authTagPart, "base64url");
  const encrypted = Buffer.from(encryptedPart, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export async function exchangeGoogleCode(code: string) {
  const { clientId, clientSecret, redirectUri } = getGoogleEnv();
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code"
  });
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });
  const json = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !json.access_token) {
    throw new Error(json.error_description ?? json.error ?? "Google code exchange failed.");
  }
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token ?? null,
    expires_in: json.expires_in ?? 0
  };
}

export async function refreshGoogleAccessToken(refreshToken: string) {
  const { clientId, clientSecret } = getGoogleEnv();
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token"
  });
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });
  const json = (await response.json()) as { access_token?: string; error?: string; error_description?: string };
  if (!response.ok || !json.access_token) {
    throw new Error(json.error_description ?? json.error ?? "Google token refresh failed.");
  }
  return json.access_token;
}

export async function fetchGoogleEmail(accessToken: string) {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) return null;
  const json = (await response.json()) as { email?: string };
  return json.email ?? null;
}

async function googleCalendarRequest<T>(accessToken: string, path: string, init?: RequestInit) {
  const response = await fetch(`${GOOGLE_CALENDAR_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {})
    }
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(data.error?.message ?? "Google Calendar API request failed.");
  }
  return data;
}

export async function createGoogleCalendarEvent(
  accessToken: string,
  input: {
    calendarId?: string;
    title: string;
    description?: string;
    startIso: string;
    endIso: string;
  }
) {
  const calendarId = input.calendarId ?? "primary";
  const payload = {
    summary: input.title,
    description: input.description || undefined,
    start: { dateTime: input.startIso, timeZone: "Asia/Kolkata" },
    end: { dateTime: input.endIso, timeZone: "Asia/Kolkata" }
  };
  const data = await googleCalendarRequest<{ id: string }>(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events`,
    { method: "POST", body: JSON.stringify(payload) }
  );
  return data.id;
}

export async function updateGoogleCalendarEvent(
  accessToken: string,
  input: {
    calendarId?: string;
    eventId: string;
    title: string;
    description?: string;
    startIso: string;
    endIso: string;
  }
) {
  const calendarId = input.calendarId ?? "primary";
  const payload = {
    summary: input.title,
    description: input.description || undefined,
    start: { dateTime: input.startIso, timeZone: "Asia/Kolkata" },
    end: { dateTime: input.endIso, timeZone: "Asia/Kolkata" }
  };
  await googleCalendarRequest(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(input.eventId)}`,
    { method: "PUT", body: JSON.stringify(payload) }
  );
}

export async function deleteGoogleCalendarEvent(accessToken: string, input: { calendarId?: string; eventId: string }) {
  const calendarId = input.calendarId ?? "primary";
  const response = await fetch(
    `${GOOGLE_CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(input.eventId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  );
  if (response.status === 404) return;
  if (!response.ok) {
    throw new Error("Failed to delete Google Calendar event.");
  }
}
