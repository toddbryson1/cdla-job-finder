// Step-up SMS OTP helpers (attorney addendum Q10).
//
// Flow: a driver authenticated via the email magic link reaches the
// Stage 2 consent screen with a "limited" session. Before they can
// submit consent we send a one-time code to the phone number on their
// driver row and add an SMS factor to the SAME Stytch session — both
// otps.sms.send and otps.authenticate accept the existing session_token,
// so the factor elevates the current session rather than starting a new
// one. getSessionState() then reports stepUp=true.
//
// Gated by STEP_UP_OTP_ENABLED (see client.ts). The pure helpers
// (toE164US, maskPhone) are unit-tested; the Stytch calls are thin.

import {
  getStytchClient,
  SESSION_IDLE_MINUTES,
  STEP_UP_OTP_EXPIRATION_MINUTES,
} from "./client";

/**
 * Normalize a US phone string to E.164 (+1XXXXXXXXXX), which Stytch
 * requires. Returns null when the input isn't a recognizable US number
 * so callers can surface a clear error rather than send to a bad number.
 */
export function toE164US(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

/** Mask an E.164 number for display: "+15125551234" -> "•••-•••-1234". */
export function maskPhone(e164: string): string {
  const last4 = e164.slice(-4);
  return `•••-•••-${last4}`;
}

export interface SendStepUpResult {
  ok: boolean;
  /** Stytch phone_id, needed as method_id at verify time. */
  methodId?: string;
  error?: string;
}

/** Send an SMS OTP to `e164Phone`, associated with the session's user. */
export async function sendStepUpSms(
  sessionToken: string,
  e164Phone: string,
): Promise<SendStepUpResult> {
  try {
    const res = await getStytchClient().otps.sms.send({
      phone_number: e164Phone,
      session_token: sessionToken,
      expiration_minutes: STEP_UP_OTP_EXPIRATION_MINUTES,
    });
    return { ok: true, methodId: res.phone_id };
  } catch (err) {
    console.error("[step-up] otps.sms.send failed:", err);
    return {
      ok: false,
      error: "We couldn't send the code. Try again in a moment.",
    };
  }
}

export interface VerifyStepUpResult {
  ok: boolean;
  /** Rotated session token to re-set on the cookie. */
  newSessionToken?: string;
  error?: string;
}

/** Verify the OTP and add the SMS factor to the existing session. */
export async function verifyStepUpSms(
  sessionToken: string,
  methodId: string,
  code: string,
): Promise<VerifyStepUpResult> {
  try {
    const res = await getStytchClient().otps.authenticate({
      method_id: methodId,
      code,
      session_token: sessionToken,
      session_duration_minutes: SESSION_IDLE_MINUTES,
    });
    return { ok: true, newSessionToken: res.session_token };
  } catch (err) {
    console.error("[step-up] otps.authenticate failed:", err);
    return {
      ok: false,
      error: "That code didn't match or has expired. Request a new one.",
    };
  }
}
