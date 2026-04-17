import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseEnv } from "@/lib/supabase/env";
import type { Database } from "@/types/database";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, anonKey } = getSupabaseEnv();

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });

  const {
    data: { user }
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAdminRoute = path.startsWith("/admin");
  const isTrainerRoute = path.startsWith("/trainer");
  const isLoginRoute = path.startsWith("/login/admin") || path.startsWith("/login/trainer");
  const isSwitchMode = request.nextUrl.searchParams.get("switch") === "1";

  if (!user && (isAdminRoute || isTrainerRoute)) {
    const next = isAdminRoute ? "/login/admin" : "/login/trainer";
    return NextResponse.redirect(new URL(next, request.url));
  }

  if (user && isLoginRoute && !isSwitchMode) {
    const { data: profile } = await (supabase as any).from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (profile?.role === "admin") return NextResponse.redirect(new URL("/admin/dashboard", request.url));
    if (profile?.role === "trainer") return NextResponse.redirect(new URL("/trainer/dashboard", request.url));
  }

  if (user && (isAdminRoute || isTrainerRoute)) {
    const { data: profile } = await (supabase as any).from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (!profile) return NextResponse.redirect(new URL("/", request.url));
    if (isAdminRoute && profile.role !== "admin") return NextResponse.redirect(new URL("/trainer/dashboard", request.url));
    if (isTrainerRoute && profile.role !== "trainer") return NextResponse.redirect(new URL("/admin/dashboard", request.url));
  }

  return response;
}
