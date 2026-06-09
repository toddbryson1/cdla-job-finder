import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/stytch/client";

// Cookie an anonymous-intake driver carries (set by /api/intake) before
// they've ever claimed an email. Mirrors the name read by the /matches
// page's anonymous-access path.
const ANON_DRIVER_COOKIE = "cdla_driver_id";

// Next.js 16 renamed `middleware.ts` to `proxy.ts`. Same hook point, same
// matcher conventions. Per the Next 16 guidance, this is an OPTIMISTIC check
// only — we look for an auth-bearing cookie and bounce to /login if there
// is none. The REAL validation (Stytch session verification AND the
// driver-identity check that the anon cookie actually matches the URL's
// driverId) happens in the /matches page server component, which is the
// actual auth boundary. This split exists because Stytch's Node SDK can't
// run in the Edge runtime that proxy uses by default, and Next 16 explicitly
// recommends against using proxy for full session management.
//
// Two valid optimistic signals — matching the page's two auth paths:
//   1. stytch_session_token — an email-claimed driver (magic-link auth).
//   2. cdla_driver_id — an anonymous-intake driver who hasn't claimed an
//      email yet. Without this branch the middleware bounced every
//      anonymous driver (the homepage Debbie-chat default flow) to /login
//      even though the page renders fine for them — the regression this
//      fixes. A forged cdla_driver_id gains nothing: the page still
//      requires it to equal the URL driverId before showing any matches.
export function proxy(request: NextRequest) {
  const hasSession = !!request.cookies.get(SESSION_COOKIE)?.value;
  const hasAnonDriver = !!request.cookies.get(ANON_DRIVER_COOKIE)?.value;
  if (hasSession || hasAnonDriver) return NextResponse.next();

  const target = new URL("/login", request.url);
  target.searchParams.set(
    "redirect",
    request.nextUrl.pathname + request.nextUrl.search,
  );
  return NextResponse.redirect(target);
}

export const config = {
  matcher: ["/matches/:path*"],
};
