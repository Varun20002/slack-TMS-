import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { encryptRefreshToken, exchangeGoogleCode, fetchGoogleEmail } from "@/lib/google-calendar";

function redirectWithStatus(request: Request, status: string) {
  return NextResponse.redirect(new URL(`/trainer/profile?calendar=${encodeURIComponent(status)}`, request.url));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return redirectWithStatus(request, "missing_code");

  const cookieStore = await cookies();
  const cookieState = cookieStore.get("google_calendar_oauth_state")?.value;
  if (!cookieState || cookieState !== state) return redirectWithStatus(request, "invalid_state");

  const supabase = (await createClient()) as any;
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return redirectWithStatus(request, "not_signed_in");

  const { data: profile } = await supabase.from("profiles").select("id, role").eq("id", user.id).maybeSingle();
  if (!profile || profile.role !== "trainer") return redirectWithStatus(request, "forbidden");

  const admin = createAdminClient() as any;
  const { data: trainer } = await admin.from("trainers").select("id").eq("profile_id", profile.id).maybeSingle();
  if (!trainer) return redirectWithStatus(request, "trainer_not_found");

  try {
    const tokenData = await exchangeGoogleCode(code);
    const existing = await admin
      .from("trainer_google_connections")
      .select("encrypted_refresh_token")
      .eq("trainer_id", trainer.id)
      .maybeSingle();

    const encryptedRefreshToken = tokenData.refresh_token
      ? encryptRefreshToken(tokenData.refresh_token)
      : (existing.data?.encrypted_refresh_token as string | undefined);
    if (!encryptedRefreshToken) {
      return redirectWithStatus(request, "missing_refresh_token");
    }

    const googleEmail = await fetchGoogleEmail(tokenData.access_token);

    const { error } = await admin.from("trainer_google_connections").upsert(
      {
        trainer_id: trainer.id,
        encrypted_refresh_token: encryptedRefreshToken,
        calendar_id: "primary",
        google_email: googleEmail,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_error: null
      },
      { onConflict: "trainer_id" }
    );

    if (error) return redirectWithStatus(request, "save_failed");
  } catch {
    return redirectWithStatus(request, "oauth_failed");
  }

  const response = redirectWithStatus(request, "connected");
  response.cookies.set("google_calendar_oauth_state", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0
  });
  return response;
}
