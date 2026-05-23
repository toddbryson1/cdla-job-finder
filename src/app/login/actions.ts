"use server";

import {
  getStytchClient,
  isStytchConfigured,
  appUrl,
  MAGIC_LINK_EXPIRATION_MINUTES,
} from "@/lib/stytch/client";

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
  // verified email after auth and routes to /matches/[id] from there.
  const callback = `${appUrl()}/authenticate`;

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
