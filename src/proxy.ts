import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/stytch/client";

// Next.js 16 renamed `middleware.ts` to `proxy.ts`. Same hook point, same
// matcher conventions. Per the Next 16 guidance, this is an OPTIMISTIC check
// only — we look for the session cookie and bounce to /login if missing.
// The real Stytch session verification (and the driver identity check)
// happens in the matches page server component, which is the actual auth
// boundary. This split exists because Stytch's Node SDK can't run in the
// Edge runtime that proxy uses by default, and Next 16 explicitly recommends
// against using proxy for full session management.
export function proxy(request: NextRequest) {
  const hasSession = !!request.cookies.get(SESSION_COOKIE)?.value;
  if (hasSession) return NextResponse.next();

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
