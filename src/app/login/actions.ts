"use server";

import { cookies } from "next/headers";
import {
  getStytchClient,
  isStytchConfigured,
  appUrl,
  MAGIC_LINK_EXPIRATION_MINUTES,
} from "@/lib/stytch/client";

/** Cookie that carries the post-auth redirect target across the
 *  magic-link round-trip. We can't put redirect in the magic-link
 *  URL itself because Stytch validates the full URL against a
 *  dashboard allow-list and arbitrary query params break that. */
const LOGIN_REDIRECT_COOKIE = "cdla_login_redirect";
const LOGIN_REDIRECT_MAX_AGE_S = 30 * 60; // 30 min, matches MLM TTL

function safeRedirectPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (raw.length === 0 || raw.length > 200) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//")) return null;
  return raw;
}

export interface SendLinkState {
  status: "idle" | "sent" | "error";
  email?: string;
  error?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// TODO: rate limit this endpoint. Magic-link send is a real abuse vector
// (email bombing). For dev this is fine; before launch wire a per-IP +
// per-email throttle (e.g. 5/hr/email, 30/hr/IP) at a higher layer.
//
// Note on existence disclosure: loginOrCreate returns success whether or not
// the email already belongs to a Stytch user, and we return the same
// "check your inbox" state either way — so this endpoint does not reveal
// whether a given email is on file (attorney addendum Q10).
export async function sendMagicLink(
  _prev: SendLinkState,
  formData: FormData,
): Promise<SendLinkState> {
  const emailRaw = formData.get("email");
  const email = typeof emailRaw === "string" ? emailRaw.trim().toLowerCase() : "";

  if (!EMAIL_RE.test(email)) {
    return { status: "error", error: "That does not look like an email." };
  }

  if (!isStytchConfigured()) {
    return {
      status: "error",
      error:
        "Magic link sending is not configured yet. Set STYTCH_PROJECT_ID and STYTCH_SECRET in .env.local.",
    };
  }

  // No query params on the callback — Stytch validates the full URL against
  // the dashboard allow-list. /authenticate looks the driver up by their
  // verified email after auth and routes to /me (or the cookied redirect
  // target) from there.
  const callback = `${appUrl()}/authenticate`;

  // If the login page captured a same-origin redirect target (e.g.
  // /me from a reverse-match email click), drop it in a httpOnly
  // cookie so /authenticate can honor it after Stytch sign-in. We
  // CAN'T put it in the callback URL because Stytch allow-lists.
  const redirectAfter = safeRedirectPath(formData.get("redirect"));
  if (redirectAfter) {
    const cookieStore = await cookies();
    cookieStore.set(LOGIN_REDIRECT_COOKIE, redirectAfter, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: LOGIN_REDIRECT_MAX_AGE_S,
    });
  }

  try {
    await getStytchClient().magicLinks.email.loginOrCreate({
      email,
      login_magic_link_url: callback,
      signup_magic_link_url: callback,
      login_expiration_minutes: MAGIC_LINK_EXPIRATION_MINUTES,
      signup_expiration_minutes: MAGIC_LINK_EXPIRATION_MINUTES,
    });
    return { status: "sent", email };
  } catch (err) {
    console.error("[login] stytch loginOrCreate failed:", err);
    return {
      status: "error",
      error:
        "We could not send the link right now. Try again in a minute, or check that the email is right.",
    };
  }
}

