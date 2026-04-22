import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = (await createClient()) as any;
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login/trainer", request.url));

  const { data: profile } = await supabase.from("profiles").select("id, role").eq("id", user.id).maybeSingle();
  if (!profile || profile.role !== "trainer") return NextResponse.redirect(new URL("/", request.url));

  const admin = createAdminClient() as any;
  const { data: trainer } = await admin.from("trainers").select("id").eq("profile_id", profile.id).maybeSingle();
  if (trainer) {
    await admin.from("trainer_google_connections").delete().eq("trainer_id", trainer.id);
  }

  return NextResponse.redirect(new URL("/trainer/profile?calendar=disconnected", request.url));
}
