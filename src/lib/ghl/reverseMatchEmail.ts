// Reverse-match alert email per
// SPEC_candidate-email-and-reverse-match-alerts-v1.md §3.5–§3.6.
//
// Fired by /api/cron/reverse-matches when an existing driver's match
// list grows because new carrier jobs were added since their last alert.
// Carrier name is intentionally withheld in the subject/preview per spec
// §3.2 — driver clicks through to see who matched.
//
// V1 simplification: no Tier 1 differentiation (spec §3.7). All alerts
// use the standard template regardless of whether any of the new matches
// happens to be a Tier 1 carrier.

import { resolveRegion } from "@/lib/regions";

const LOGIN_URL_PATH = "/login";

export interface ReverseMatchEmailInput {
  firstName: string;
  cdlState: string | null;
  newMatchCount: number;
  appUrl: string; // e.g. https://www.cdla.jobs
}

export interface ReverseMatchEmailOutput {
  subject: string;
  html: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function shell(bodyInner: string): string {
  return `
<!doctype html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f1419; line-height: 1.55; font-size: 15px; max-width: 600px; margin: 0 auto; padding: 24px;">
    ${bodyInner}
    <p style="margin-top: 28px; color: #5b6573; font-size: 12px;">CDLA.jobs &middot; Class A driver matching. Built for drivers.</p>
  </body>
</html>
`.trim();
}

export function reverseMatchEmail(
  input: ReverseMatchEmailInput,
): ReverseMatchEmailOutput {
  const region = resolveRegion(input.cdlState);
  const greeting = input.firstName
    ? `Hey ${escapeHtml(input.firstName)} &mdash;`
    : "Hey there &mdash;";
  const matchesUrl = `${input.appUrl}${LOGIN_URL_PATH}`;

  if (input.newMatchCount === 1) {
    // Single new match — spec §3.5
    const subject = `New CDL-A carrier matching your profile in ${region}`;
    const inner = `
    <p>${greeting}</p>

    <p>A carrier just joined CDLA.jobs that matches your profile. They&rsquo;re hiring CDL-A drivers in ${escapeHtml(region)} for the equipment you&rsquo;re looking for.</p>

    <p style="margin: 24px 0;">
      <a href="${escapeHtml(matchesUrl)}" style="display: inline-block; background: #1F3A5F; color: #ffffff; padding: 12px 22px; border-radius: 6px; font-weight: 600; text-decoration: none;">See the match</a>
    </p>

    <p>If you&rsquo;re not actively looking right now, ignore this. We&rsquo;ll keep watching.</p>

    <p style="margin-top: 22px;">&mdash; The CDLA.jobs team</p>
    `.trim();
    return { subject, html: shell(inner) };
  }

  // Multiple new matches — spec §3.6
  const subject = `${input.newMatchCount} new CDL-A carriers matching you in ${region}`;
  const inner = `
    <p>${greeting}</p>

    <p>${input.newMatchCount} new carriers joined CDLA.jobs that match your profile. All hiring CDL-A drivers in ${escapeHtml(region)} for the equipment you&rsquo;re looking for.</p>

    <p style="margin: 24px 0;">
      <a href="${escapeHtml(matchesUrl)}" style="display: inline-block; background: #1F3A5F; color: #ffffff; padding: 12px 22px; border-radius: 6px; font-weight: 600; text-decoration: none;">See the matches</a>
    </p>

    ${
      input.newMatchCount >= 4
        ? `<p>That&rsquo;s a noticeable jump &mdash; sometimes happens when a new region opens up or a recruiter network turns on. Worth scanning.</p>`
        : ""
    }

    <p>If none of them are your fit, no problem. Your existing matches are still there, and we&rsquo;ll keep watching for more.</p>

    <p style="margin-top: 22px;">&mdash; The CDLA.jobs team</p>
  `.trim();
  return { subject, html: shell(inner) };
}
