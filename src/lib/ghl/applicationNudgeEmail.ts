// Application-nudge email — sent to drivers who completed intake but
// haven't consented to any carrier yet. Fires at T+24h and T+7d after
// intake (max 2 nudges per driver, ever). Different from
// reverseMatchEmail in voice: this one is "your matches are waiting,"
// reverseMatch is "new carriers joined."
//
// Carrier names are intentionally withheld per the same pattern as
// reverseMatchEmail (spec §3.2). Driver clicks through to see who.
//
// Voice rules:
//   - First nudge (24h): low pressure, "in case you missed it." Many
//     drivers complete intake during a break and don't return that
//     same day.
//   - Second nudge (7d): still warm, slightly more direct. Mentions
//     that matches are time-sensitive — carriers fill seats and
//     positions cycle. No fake urgency.
//
// Never use "guaranteed," "exclusive," or "limited time" — those are
// recruiter-spam tropes the brand voice guide forbids.

import { resolveRegion } from "@/lib/regions";

const LOGIN_URL_PATH = "/login?redirect=%2Fme";

export interface ApplicationNudgeEmailInput {
  firstName: string;
  cdlState: string | null;
  matchCount: number;
  /** 1 = first nudge (T+24h), 2 = second/final nudge (T+7d). */
  nudgeIndex: 1 | 2;
  /** e.g. https://www.cdla.jobs */
  appUrl: string;
}

export interface ApplicationNudgeEmailOutput {
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

export function applicationNudgeEmail(
  input: ApplicationNudgeEmailInput,
): ApplicationNudgeEmailOutput {
  const region = resolveRegion(input.cdlState);
  const greeting = input.firstName
    ? `Hey ${escapeHtml(input.firstName)} &mdash;`
    : "Hey there &mdash;";
  const matchesUrl = `${input.appUrl}${LOGIN_URL_PATH}`;
  const countLabel =
    input.matchCount === 1
      ? "1 carrier"
      : `${input.matchCount} carriers`;

  if (input.nudgeIndex === 1) {
    const subject =
      input.matchCount === 1
        ? `${input.firstName ? `${input.firstName}, your ` : "Your "}match is waiting`
        : `${input.firstName ? `${input.firstName}, ` : ""}${countLabel} are waiting on you`;
    const inner = `
    <p>${greeting}</p>

    <p>You finished your intake yesterday and we matched you with <strong>${countLabel}</strong> hiring CDL-A drivers in ${escapeHtml(region)}. None of them have heard from you yet.</p>

    <p>That&rsquo;s fine &mdash; most drivers think it over for a day before they pick a carrier. Most also send 2&ndash;3 applications in the same sitting once they do, since the carriers&rsquo; questions overlap.</p>

    <p style="margin: 24px 0;">
      <a href="${escapeHtml(matchesUrl)}" style="display: inline-block; background: #1F3A5F; color: #ffffff; padding: 12px 22px; border-radius: 6px; font-weight: 600; text-decoration: none;">See ${input.matchCount === 1 ? "the match" : "your matches"}</a>
    </p>

    <p>Not ready? No problem. We&rsquo;ll keep watching for new carriers and email you when we find one.</p>

    <p style="margin-top: 22px;">&mdash; The CDLA.jobs team</p>
    `.trim();
    return { subject, html: shell(inner) };
  }

  // nudgeIndex === 2 — last in the series. Slightly more direct.
  const subject =
    input.matchCount === 1
      ? `Still thinking it over? Your match is still waiting.`
      : `Still thinking it over? Your ${input.matchCount} matches are still waiting.`;
  const inner = `
    <p>${greeting}</p>

    <p>It&rsquo;s been about a week since we matched you with <strong>${countLabel}</strong> in ${escapeHtml(region)}. They&rsquo;re still on your list.</p>

    <p>Carrier positions cycle &mdash; a seat that&rsquo;s open this week might be filled next week, and a different carrier might pick up the slack. Worth a quick scan if you&rsquo;ve got five minutes.</p>

    <p style="margin: 24px 0;">
      <a href="${escapeHtml(matchesUrl)}" style="display: inline-block; background: #1F3A5F; color: #ffffff; padding: 12px 22px; border-radius: 6px; font-weight: 600; text-decoration: none;">${input.matchCount === 1 ? "Open the match" : "Open my matches"}</a>
    </p>

    <p>This is the last nudge from us &mdash; we&rsquo;ll keep watching quietly and only reach out again when a new carrier matches your profile.</p>

    <p style="margin-top: 22px;">&mdash; The CDLA.jobs team</p>
  `.trim();
  return { subject, html: shell(inner) };
}
