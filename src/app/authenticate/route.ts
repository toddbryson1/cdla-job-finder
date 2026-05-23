import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { drivers } from "@/db/schema";
import {
  getStytchClient,
  isStytchConfigured,
  SESSION_COOKIE,
  SESSION_IDLE_MINUTES,
  SESSION_ABSOLUTE_SECONDS,
} from "@/lib/stytch/client";

export const runtime = "nodejs";

// Stytch magic-link callback. Route Handler (not a server component) so it
// can set the session cookie — Next 16 forbids cookies().set() inside
// server components.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/login?auth=missing_token", url));
  }

  if (!isStytchConfigured()) {
    return NextResponse.redirect(new URL("/login?auth=not_configured", url));
  }

  let sessionToken: string | undefined;
  let verifiedEmail: string | null = null;

  try {
    const result = await getStytchClient().magicLinks.authenticate({
      token,
      session_duration_minutes: SESSION_IDLE_MINUTES,
    });
    sessionToken = result.session_token;
    const verified =
      result.user.emails.find((e) => e.verified) ?? result.user.emails[0];
    verifiedEmail = verified?.email?.toLowerCase() ?? null;
  } catch (err) {
    const e = err as {
      status_code?: number;
      error_type?: string;
      error_message?: string;
    };
    console.error("[authenticate] stytch authenticate failed:", {
      status_code: e.status_code,
      error_type: e.error_type,
      error_message: e.error_message,
    });
    const reason = e.error_type ?? "unknown";
    return NextResponse.redirect(
      new URL(`/login?auth=${encodeURIComponent(reason)}`, url),
    );
  }

  if (!sessionToken) {
    return NextResponse.redirect(new URL("/login?auth=no_session", url));
  }

  // Look up driver by verified email. If they've re-submitted intake more
  // than once we have multiple rows for the same email — take the most
  // recent so they see the answers they just gave us.
  let destination = "/";
  if (verifiedEmail) {
    const driver = await db.query.drivers.findFirst({
      where: eq(drivers.email, verifiedEmail),
      orderBy: [desc(drivers.createdAt)],
      columns: { id: true },
    });
    if (driver) destination = `/matches/${driver.id}`;
  }

  const response = NextResponse.redirect(new URL(destination, url));
  response.cookies.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_ABSOLUTE_SECONDS,
  });
  return response;
}
