import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/stytch/client";

// Cookie an anonymous-intake driver carries (set by /api/intake) before
// they've ever claimed an email. Mirrors the name read by the /matches
// page's anonymous-access path.
const ANON_DRIVER_COOKIE = "cdla_driver_id";

// Next.js 16 renamed `middleware.ts` to `proxy.ts`. Same hook point, same
// matcher conventions. Two concerns live here, both Edge-safe (string
// constants + regex only — no Stytch SDK, which can't run in Edge):
//
//  1. Optimistic auth gate for /matches/* — bounce to /login if there's no
//     auth-bearing cookie. The REAL validation happens in the matches page
//     server component (the actual auth boundary); this is just a fast
//     pre-check, per Next 16 guidance against full session management in
//     proxy. TWO valid optimistic signals, matching the page's two auth
//     paths:
//       - stytch_session_token — an email-claimed driver (magic-link auth).
//       - cdla_driver_id — an anonymous-intake driver who hasn't claimed an
//         email yet. Without this, the gate bounced every anonymous driver
//         (the homepage Debbie-chat default flow) to /login even though the
//         page renders fine for them. A forged cdla_driver_id gains nothing:
//         the page still requires it to equal the URL driverId.
//
//  2. Video-script conversion attribution (video template docs §14) —
//     capture ?vsrc=<slug>__<template> from video-CTA clicks into a
//     first-touch, first-party httpOnly cookie so it survives the hop to
//     /intake, where the intake route records it on intake_completed.
//     First-touch: the first video that brought the driver wins.

const VSRC_COOKIE = "cdla_vsrc";
const VSRC_MAX_AGE_S = 30 * 24 * 60 * 60; // 30 days
// slug__template — lowercase slug/template chars only; length-capped to
// reject junk before it reaches a cookie.
const VSRC_RE = /^[a-z0-9-]{1,60}__[a-z0-9-]{1,40}$/;

export function proxy(request: NextRequest) {
  // 1. Auth gate — only for /matches/*.
  if (request.nextUrl.pathname.startsWith("/matches")) {
    const hasSession = !!request.cookies.get(SESSION_COOKIE)?.value;
    const hasAnonDriver = !!request.cookies.get(ANON_DRIVER_COOKIE)?.value;
    if (!hasSession && !hasAnonDriver) {
      const target = new URL("/login", request.url);
      target.searchParams.set(
        "redirect",
        request.nextUrl.pathname + request.nextUrl.search,
      );
      return NextResponse.redirect(target);
    }
  }

  // 2. First-touch vsrc capture — any page request carrying the param.
  const vsrc = request.nextUrl.searchParams.get("vsrc");
  if (vsrc && !request.cookies.has(VSRC_COOKIE) && VSRC_RE.test(vsrc)) {
    const response = NextResponse.next();
    response.cookies.set({
      name: VSRC_COOKIE,
      value: vsrc,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: VSRC_MAX_AGE_S,
    });
    return response;
  }

  return NextResponse.next();
}

export const config = {
  // Page requests only — skip API routes, Next internals, and static
  // assets (anything with a file extension). Covers /matches/* (auth gate)
  // and /jobs/* (where vsrc lands).
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
