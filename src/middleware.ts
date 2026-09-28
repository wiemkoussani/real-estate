import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(req: NextRequest) {
  const { res, user, role } = await updateSession(req);
  const path = req.nextUrl.pathname;

  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  const isAdminArea = path.startsWith("/admin");
  const isAdminLogin = path === "/admin/login";
  const isClientArea = path.startsWith("/client");
  const isClientLogin = path === "/client/login" || path === "/client/set-password" || path === "/client/forgot";
  const isAuthCallback = path.startsWith("/auth/callback");

  if (isAdminArea && !isAdminLogin) {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      const login = req.nextUrl.clone();
      login.pathname = "/admin/login";
      login.searchParams.set("setup", "1");
      return NextResponse.redirect(login);
    }
    if (!user) {
      const login = req.nextUrl.clone();
      login.pathname = "/admin/login";
      login.searchParams.set("next", path);
      return NextResponse.redirect(login);
    }
    if (role !== "admin") {
      const login = req.nextUrl.clone();
      login.pathname = "/admin/login";
      login.searchParams.set("denied", "1");
      return NextResponse.redirect(login);
    }
  }

  if (isAuthCallback) return res;

  if (isClientArea && !isClientLogin) {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      const login = req.nextUrl.clone();
      login.pathname = "/client/login";
      login.searchParams.set("setup", "1");
      return NextResponse.redirect(login);
    }
    if (!user) {
      const login = req.nextUrl.clone();
      login.pathname = "/client/login";
      login.searchParams.set("next", path);
      return NextResponse.redirect(login);
    }
    if (role !== "client") {
      const dest = req.nextUrl.clone();
      dest.pathname = role === "admin" ? "/admin" : "/client/login";
      if (role !== "admin") dest.searchParams.set("denied", "1");
      else dest.search = "";
      return NextResponse.redirect(dest);
    }
  }

  if (isAdminLogin && user && role === "admin") {
    const dash = req.nextUrl.clone();
    dash.pathname = "/admin";
    dash.search = "";
    return NextResponse.redirect(dash);
  }

  if (path === "/client/login" && user && role === "client") {
    const dash = req.nextUrl.clone();
    dash.pathname = "/client";
    dash.search = "";
    return NextResponse.redirect(dash);
  }

  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|complexes/|favicon.ico).*)"] };
