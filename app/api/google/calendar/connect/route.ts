import { randomBytes } from "crypto";
import { NextResponse } from "next/server";

import { buildGoogleCalendarAuthUrl } from "@/lib/google-calendar";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = (await createClient()) as any;
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login/trainer", request.url));

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile || profile.role !== "trainer") return NextResponse.redirect(new URL("/", request.url));

  const state = randomBytes(20).toString("hex");
  const redirect = NextResponse.redirect(buildGoogleCalendarAuthUrl(state));
  redirect.cookies.set("google_calendar_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10
  });
  return redirect;
}
