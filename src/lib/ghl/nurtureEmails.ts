// Six-email driver nurture sequence. Each email fires on a 30-day
// cadence after intake (30, 60, 90, 120, 150, 180 days). Content is
// the v1 simplified version of SPEC_driver-nurture-sequence-v1.md —
// uses only first_name + region (no match-count or pay-benchmark
// variables, deferred to v2 when we have the data plumbing).
//
// Sent from /api/cron/nurture via the GHL conversations/messages API.
// One row per send is recorded in driver_nurture_sends.

import { resolveRegion } from "@/lib/regions";

const LOGIN_URL_PATH = "/login";
const INTAKE_URL_PATH = "/intake";

export interface NurtureEmailInput {
  firstName: string;
  cdlState: string | null;
  appUrl: string; // e.g. https://cdla.jobs
  emailIndex: 1 | 2 | 3 | 4 | 5 | 6;
}

export interface NurtureEmailOutput {
  subject: string;
  html: string;
}

export function nurtureEmail(input: NurtureEmailInput): NurtureEmailOutput {
  switch (input.emailIndex) {
    case 1:
      return email1MatchUpdate(input);
    case 2:
      return email2Reengage(input);
    case 3:
      return email3Educational(input);
    case 4:
      return email4MatchUpdate(input);
    case 5:
      return email5Reengage(input);
    case 6:
      return email6SixMonth(input);
  }
}

// ---------- shared layout helpers ----------

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

function greeting(firstName: string): string {
  return firstName
    ? `Hey ${escapeHtml(firstName)} &mdash;`
    : "Hey there &mdash;";
}

function primaryButton(href: string, label: string): string {
  return `<p style="margin: 24px 0;"><a href="${escapeHtml(href)}" style="display: inline-block; background: #1F3A5F; color: #ffffff; padding: 12px 22px; border-radius: 6px; font-weight: 600; text-decoration: none;">${escapeHtml(label)}</a></p>`;
}

function secondaryLink(href: string, label: string): string {
  return `<p style="margin: 16px 0;"><a href="${escapeHtml(href)}" style="color: #2E5C8A; text-decoration: underline; font-weight: 500;">${escapeHtml(label)}</a></p>`;
}

function loginUrl(appUrl: string): string {
  return `${appUrl}${LOGIN_URL_PATH}`;
}

function intakeUrl(appUrl: string): string {
  return `${appUrl}${INTAKE_URL_PATH}`;
}

// ---------- email 1: Month 1 — Match update ----------

function email1MatchUpdate(input: NurtureEmailInput): NurtureEmailOutput {
  const region = resolveRegion(input.cdlState);
  const subject = `New CDL-A carriers in ${region} this month`;
  const inner = `
    <p>${greeting(input.firstName)}</p>

    <p>It&rsquo;s been about a month since you finished your intake. Here&rsquo;s where things stand.</p>

    <p><strong>The matching engine has been watching ${escapeHtml(region)} for you.</strong> New carriers join the platform every week, and equipment / region coverage grows steadily. Worth a look to see what&rsquo;s matching for you right now.</p>

    ${primaryButton(loginUrl(input.appUrl), "See my matches")}

    <p>If your situation has changed &mdash; new endorsements, more flexibility on region or equipment, different pay floor &mdash; update your preferences and we&rsquo;ll re-run the match. Takes about a minute.</p>

    ${secondaryLink(intakeUrl(input.appUrl), "Update my preferences")}

    <p>If you&rsquo;re already in conversation with a carrier we matched you with, ignore this. Just checking in.</p>

    <p style="margin-top: 22px;">&mdash; The CDLA.jobs team</p>
  `.trim();
  return { subject, html: shell(inner) };
}

// ---------- email 2: Month 2 — Re-engagement ----------

function email2Reengage(input: NurtureEmailInput): NurtureEmailOutput {
  const region = resolveRegion(input.cdlState);
  const subject = "Anything change since we last talked?";
  const inner = `
    <p>${greeting(input.firstName)}</p>

    <p>60 days in. Two questions:</p>

    <p><strong>1. Has anything changed?</strong> Driver life moves fast. New equipment certification, new endorsement, you got tired of OTR and want something local, you&rsquo;re open to a different region &mdash; any of these changes how we match you. Takes a minute to update.</p>

    ${primaryButton(intakeUrl(input.appUrl), "Update my preferences")}

    <p><strong>2. Are you actually looking right now?</strong> Sometimes drivers intake when they&rsquo;re curious, not ready. If you&rsquo;re not actively looking, no problem &mdash; we&rsquo;ll keep watching for you in the background. If you want us to stop emailing until you&rsquo;re ready, hit the unsubscribe link below and come back when the time&rsquo;s right.</p>

    <p>Either way, here&rsquo;s what&rsquo;s matching for you in ${escapeHtml(region)} right now:</p>

    ${secondaryLink(loginUrl(input.appUrl), "See my matches")}

    <p style="margin-top: 22px;">&mdash; The CDLA.jobs team</p>
  `.trim();
  return { subject, html: shell(inner) };
}

// ---------- email 3: Month 3 — Educational ----------

function email3Educational(input: NurtureEmailInput): NurtureEmailOutput {
  const region = resolveRegion(input.cdlState);
  const subject = `Real talk on CDL-A hiring in ${region} right now`;
  const inner = `
    <p>${greeting(input.firstName)}</p>

    <p>Three months in. Quick read on what&rsquo;s happening in the ${escapeHtml(region)} CDL-A market right now.</p>

    <p>Pay across ${escapeHtml(region)} is shifting on most equipment types &mdash; some carriers are tightening, others are pushing rates up to fill seats. The middle of the market still moves more drivers than either end, and the carriers we work with publish their actual pay ranges instead of dollar-sign emojis on a job board.</p>

    <p>Lanes are turning over too. Dedicated routes that didn&rsquo;t exist six months ago are showing up; some OTR runs that used to be steady are softening. The carriers in our network update their hiring criteria as freight shifts, so the match list you saw at intake isn&rsquo;t the same one running today.</p>

    ${primaryButton(loginUrl(input.appUrl), "See what's matching now")}

    <p>If you have a pay floor in mind that the market hasn&rsquo;t hit yet, hold it. If you&rsquo;re flexible and you&rsquo;d rather see options, drop the floor on your profile by $100/week and re-run.</p>

    ${secondaryLink(intakeUrl(input.appUrl), "Update my preferences")}

    <p style="margin-top: 22px;">&mdash; The CDLA.jobs team</p>
  `.trim();
  return { subject, html: shell(inner) };
}

// ---------- email 4: Month 4 — Match update ----------

function email4MatchUpdate(input: NurtureEmailInput): NurtureEmailOutput {
  const region = resolveRegion(input.cdlState);
  const subject = `Four months in — here's what's changed in ${region}`;
  const inner = `
    <p>${greeting(input.firstName)}</p>

    <p>Four months in. Carrier list in ${escapeHtml(region)} has turned over since you intaked &mdash; new operators came online, some old ones tightened their criteria, lanes shifted.</p>

    ${primaryButton(loginUrl(input.appUrl), "See my current matches")}

    <p>One question if you have a sec: anything specific you wish CDLA.jobs did differently? Reply to this email &mdash; it&rsquo;s a real inbox, not a no-reply.</p>

    <p style="margin-top: 22px;">&mdash; The CDLA.jobs team</p>
  `.trim();
  return { subject, html: shell(inner) };
}

// ---------- email 5: Month 5 — Re-engagement ----------

function email5Reengage(input: NurtureEmailInput): NurtureEmailOutput {
  const subject = "Five months in — quick check";
  const inner = `
    <p>${greeting(input.firstName)}</p>

    <p>Five months since intake. Honest question: is CDLA.jobs still useful to you?</p>

    <p>If you&rsquo;re still looking and we&rsquo;re not delivering matches that fit, that&rsquo;s on us &mdash; and we&rsquo;d want to know. Reply to this email and tell us what&rsquo;s not working. We read every reply.</p>

    <p>If you&rsquo;re still looking and we are delivering matches but nothing&rsquo;s converted to a hire, the matching is working but the interviews aren&rsquo;t landing. That&rsquo;s usually a fit issue with the specific carriers, not a profile issue with you. Sometimes worth updating your preferences to widen the pool a bit.</p>

    ${primaryButton(intakeUrl(input.appUrl), "Update my preferences")}

    <p>If you&rsquo;re not looking anymore &mdash; you found something off-platform, you decided to stay where you are, you&rsquo;re taking a break from driving &mdash; just hit unsubscribe below. No hard feelings.</p>

    <p>Or take a quick look at what&rsquo;s matching today:</p>

    ${secondaryLink(loginUrl(input.appUrl), "See my matches")}

    <p style="margin-top: 22px;">&mdash; The CDLA.jobs team</p>
  `.trim();
  return { subject, html: shell(inner) };
}

// ---------- email 6: Month 6 — Six-month check-in (last email in v1) ----------

function email6SixMonth(input: NurtureEmailInput): NurtureEmailOutput {
  const region = resolveRegion(input.cdlState);
  const subject = "Six months in — what we've learned";
  const inner = `
    <p>${greeting(input.firstName)}</p>

    <p>Six months on CDLA.jobs. Here&rsquo;s what we&rsquo;re going to do from here.</p>

    <p>From this point on, we&rsquo;re going to dial back the email cadence to keep you in the loop without flooding your inbox. We&rsquo;ll send updates when something specific changes &mdash; new carrier in ${escapeHtml(region)}, big shift in pay benchmarks, or anything else worth your attention.</p>

    <p>In the meantime, if you&rsquo;re still looking, two things that usually move the needle:</p>

    <p><strong>1. Update your preferences.</strong> Six months can change a lot &mdash; new endorsements, new tolerance for relocation, different pay floor. Refreshing your profile re-runs the match against the current carrier pool, which has turned over a lot since you started.</p>

    ${secondaryLink(intakeUrl(input.appUrl), "Update my preferences")}

    <p><strong>2. Check your match list one more time.</strong> The carriers actively hiring CDL-A drivers in ${escapeHtml(region)} this month look different from the ones we showed you six months ago.</p>

    ${primaryButton(loginUrl(input.appUrl), "See my matches")}

    <p>If you&rsquo;d rather we stop, just unsubscribe below. No problem.</p>

    <p style="margin-top: 22px;">&mdash; The CDLA.jobs team</p>
  `.trim();
  return { subject, html: shell(inner) };
}
