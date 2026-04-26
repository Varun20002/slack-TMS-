import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  try {
    return await updateSession(request);
  } catch (error) {
    const path = request.nextUrl.pathname;
    const isAdminRoute = path.startsWith("/admin");
    const isTrainerRoute = path.startsWith("/trainer");
    console.error("Middleware failure", error);

    if (isAdminRoute || isTrainerRoute) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.next();
  }
}

export const config = {
  matcher: ["/admin/:path*", "/trainer/:path*", "/login", "/login/:path*"]
};
