import { cookies } from "next/headers";
import {
  getStytchClient,
  isStytchConfigured,
  SESSION_COOKIE,
  SESSION_IDLE_MINUTES,
} from "./client";

export type SessionState =
  | { kind: "no_session" }
  | { kind: "stytch_unconfigured" }
  | { kind: "invalid" }
  | {
      kind: "ok";
      email: string;
      userId: string;
    };

// Server-side session verification. Hits Stytch's API on every call so that
// revocation and expiry are honored in real time, per the prompt's "use
// Stytch's server-side session verification" requirement. The `idle` window
// is refreshed on each successful authenticate by passing
// `session_duration_minutes`.
export async function getSessionState(): Promise<SessionState> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return { kind: "no_session" };
  if (!isStytchConfigured()) return { kind: "stytch_unconfigured" };

  try {
    const res = await getStytchClient().sessions.authenticate({
      session_token: token,
      session_duration_minutes: SESSION_IDLE_MINUTES,
    });
    const verified = res.user.emails.find((e) => e.verified) ?? res.user.emails[0];
    if (!verified?.email) return { kind: "invalid" };
    return {
      kind: "ok",
      email: verified.email.toLowerCase(),
      userId: res.user.user_id,
    };
  } catch (err) {
    console.error("[session] stytch sessions.authenticate failed:", err);
    return { kind: "invalid" };
  }
}
