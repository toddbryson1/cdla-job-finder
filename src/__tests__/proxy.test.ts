import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

// The /matches middleware is an OPTIMISTIC gate. It must let through BOTH
// auth paths the page supports — an email-claimed Stytch session AND an
// anonymous-intake driver carrying only cdla_driver_id. The regression
// this pins: anonymous drivers (the homepage Debbie-chat default flow)
// were bounced to /login because only the Stytch cookie was accepted.

function reqWithCookie(cookie?: string): NextRequest {
  return new NextRequest("https://cdla.jobs/matches/some-driver-id", {
    headers: cookie ? { cookie } : {},
  });
}

function isRedirectToLogin(res: Response): boolean {
  const loc = res.headers.get("location");
  return res.status >= 300 && res.status < 400 && !!loc && loc.includes("/login");
}

describe("proxy (/matches middleware)", () => {
  it("redirects to /login when there is no auth cookie at all", () => {
    expect(isRedirectToLogin(proxy(reqWithCookie()))).toBe(true);
  });

  it("lets an email-claimed driver (stytch session) through", () => {
    const res = proxy(reqWithCookie("stytch_session_token=abc123"));
    expect(isRedirectToLogin(res)).toBe(false);
  });

  it("lets an ANONYMOUS-intake driver (cdla_driver_id only) through", () => {
    // The regression case: before the fix this redirected to /login.
    const res = proxy(reqWithCookie("cdla_driver_id=some-driver-id"));
    expect(isRedirectToLogin(res)).toBe(false);
  });

  it("preserves the original path in the ?redirect= param when bouncing", () => {
    const res = proxy(reqWithCookie());
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("redirect=");
    expect(decodeURIComponent(loc)).toContain("/matches/some-driver-id");
  });
});
