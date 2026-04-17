import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Database, Role } from "@/types/database";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export async function getCurrentUser() {
  const supabase = (await createClient()) as any;
  const {
    data: { user }
  } = await supabase.auth.getUser();
  return user;
}

export async function getCurrentProfile() {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = (await createClient()) as any;
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return data;
}

export async function requireRole(role: Role) {
  const profile = await getCurrentProfile();
  if (!profile) redirect(role === "admin" ? "/login/admin" : "/login/trainer");
  if (profile.role !== role) redirect(profile.role === "admin" ? "/admin/dashboard" : "/trainer/dashboard");
  return profile;
}
