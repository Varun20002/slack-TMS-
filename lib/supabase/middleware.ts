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
  const isTrainerFirstLoginRoute = path.startsWith("/trainer/first-login");
  const isSwitchMode = request.nextUrl.searchParams.get("switch") === "1";
  const userId = user?.id ?? null;

  async function loadProfile() {
    if (!userId) return null;
    const withFlag = await (supabase as any).from("profiles").select("role, must_change_password").eq("id", userId).maybeSingle();
    if (!withFlag.error) return withFlag.data;
    const fallback = await (supabase as any).from("profiles").select("role").eq("id", userId).maybeSingle();
    if (!fallback.data) return null;
    return { ...fallback.data, must_change_password: false };
  }

  if (!user && (isAdminRoute || isTrainerRoute)) {
    const next = isAdminRoute ? "/login/admin" : "/login/trainer";
    return NextResponse.redirect(new URL(next, request.url));
  }

  if (user && isLoginRoute && !isSwitchMode) {
    const profile = await loadProfile();
    if (profile?.role === "trainer" && profile.must_change_password) {
      return NextResponse.redirect(new URL("/trainer/first-login", request.url));
    }
    if (profile?.role === "admin") return NextResponse.redirect(new URL("/admin/dashboard", request.url));
    if (profile?.role === "trainer") return NextResponse.redirect(new URL("/trainer/dashboard", request.url));
  }

  if (user && (isAdminRoute || isTrainerRoute)) {
    const profile = await loadProfile();
    if (!profile) return NextResponse.redirect(new URL("/", request.url));
    if (isAdminRoute && profile.role !== "admin") return NextResponse.redirect(new URL("/trainer/dashboard", request.url));
    if (isTrainerRoute && profile.role !== "trainer") return NextResponse.redirect(new URL("/admin/dashboard", request.url));
    if (isTrainerRoute && profile.role === "trainer" && profile.must_change_password && !isTrainerFirstLoginRoute) {
      return NextResponse.redirect(new URL("/trainer/first-login", request.url));
    }
    if (isTrainerFirstLoginRoute && profile.role === "trainer" && !profile.must_change_password) {
      return NextResponse.redirect(new URL("/trainer/dashboard", request.url));
    }
  }

  return response;
}
