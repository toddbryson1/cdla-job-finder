// Unsubscribe token derivation + email-footer helper. Used by every
// outbound CDLA.jobs email template so we get a compliant
// "unsubscribe" link without a separate token table.
//
// Token is HMAC-SHA256(driverId, UNSUBSCRIBE_SECRET), URL-safe
// base64'd to ~43 chars. /unsubscribe verifies the token by
// recomputing the HMAC and constant-time comparing. Driver ID is
// passed alongside so the route knows whose row to flag.
//
// Why HMAC over a stored token:
//   - No new column needed; works against legacy drivers
//   - Tokens are stable per driver (a stale link from 6 months ago
//     still works — drivers WANT this, "my unsubscribe link doesn't
//     work" is a worse experience than possible token replay)
//   - Secret rotation invalidates all old tokens uniformly. Migration
//     path: rotate UNSUBSCRIBE_SECRET → drivers get new tokens in
//     subsequent emails; old links 404 cleanly.

import { createHmac, timingSafeEqual } from "crypto";

const UNSUBSCRIBE_PATH = "/unsubscribe";

/** Driver-stable unsubscribe token. Deterministic for a given
 *  (driverId, UNSUBSCRIBE_SECRET) pair. */
export function deriveUnsubscribeToken(driverId: string): string {
  const secret = process.env.UNSUBSCRIBE_SECRET;
  if (!secret) {
    // Fail loud rather than silently send emails with broken links.
    // The caller (email-template-render path) sees the throw and the
    // runner's existing catch logs + records the failure.
    throw new Error(
      "UNSUBSCRIBE_SECRET is not set — refusing to render an email without a working unsubscribe link.",
    );
  }
  return createHmac("sha256", secret)
    .update(driverId)
    .digest("base64url");
}

/** Constant-time check of a token against the expected value for the
 *  given driverId. Returns false on length mismatch (without
 *  exposing it to timing analysis) and false when the secret isn't
 *  set. */
export function verifyUnsubscribeToken(
  driverId: string,
  token: string,
): boolean {
  if (!driverId || !token) return false;
  let expected: string;
  try {
    expected = deriveUnsubscribeToken(driverId);
  } catch {
    return false;
  }
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface UnsubscribeFooterInput {
  driverId: string;
  /** Absolute origin like https://www.cdla.jobs. */
  appUrl: string;
  /** Human-readable email being unsubscribed (rendered in the
   *  copy for transparency — "this address" feels evasive). */
  email: string;
}

/** HTML fragment for the CAN-SPAM-compliant footer. Two-color,
 *  small, doesn't compete with the body. The "manage preferences"
 *  variant points at /me so the driver can also see their dashboard
 *  if they want to stay subscribed but adjust something else (in
 *  the future). */
export function renderUnsubscribeFooter(
  input: UnsubscribeFooterInput,
): string {
  const token = deriveUnsubscribeToken(input.driverId);
  const url = `${input.appUrl}${UNSUBSCRIBE_PATH}?did=${encodeURIComponent(input.driverId)}&t=${encodeURIComponent(token)}`;
  const escapedEmail = input.email
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  // CAN-SPAM (15 USC § 7704(a)(5)(A)(iii)) requires the physical
  // postal address of the sender. Sourced from CDLA_SENDER_ADDRESS
  // env var so legal can update without a code deploy. The fallback
  // is intentionally obviously-a-placeholder so a deploy with the
  // env var unset is loud rather than silent.
  const senderAddress =
    process.env.CDLA_SENDER_ADDRESS ??
    "[SENDER_ADDRESS_NOT_SET — set CDLA_SENDER_ADDRESS env var]";
  return `
<hr style="margin: 28px 0 16px 0; border: none; border-top: 1px solid #e5e9ef;" />
<p style="margin: 0; color: #5b6573; font-size: 11px; line-height: 1.55;">
  You&rsquo;re receiving this because you signed up at CDLA.jobs with ${escapedEmail}.
  <a href="${url}" style="color: #5b6573; text-decoration: underline;">Unsubscribe</a>
  from CDLA.jobs match alerts.
</p>
<p style="margin: 6px 0 0 0; color: #94a0b0; font-size: 11px; line-height: 1.55;">
  ${senderAddress
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")}
</p>
`.trim();
}
