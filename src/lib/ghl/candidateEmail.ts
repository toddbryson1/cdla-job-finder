// Post-intake candidate email. Copy locked per
// SPEC_candidate-email-and-reverse-match-alerts-v1.md §2.
//
// Two body variants:
//   - matchCount > 0: list top 3 carrier names, "see my matches" CTA
//   - matchCount === 0: honest zero-match acknowledgment + suggestions
//
// Subject is the spec's Variant A ("Direct"): "Your CDLA.jobs matches"
// — chosen for v1 to avoid running an A/B test before we have any volume.
//
// Region resolution is intentionally simple: we map cdl_state to a state
// name when possible; otherwise fall back to "your area" per spec §5.
// Equipment-specific and pay-range variants are reverse-match concerns
// (out of scope for the candidate email).

interface CandidateEmailInput {
  firstName: string;
  cdlState: string | null;
  matchCount: number;
  topCarrierNames: string[]; // up to 3
  matchesUrl: string; // /matches/[driverId] absolute URL
}

const US_STATE_NAMES: Record<string, string> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
  DC: "Washington, D.C.",
};

function resolveRegion(cdlState: string | null): string {
  if (!cdlState) return "your area";
  const name = US_STATE_NAMES[cdlState.toUpperCase()];
  return name ?? "your area";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function candidateEmail(
  input: CandidateEmailInput,
): { subject: string; html: string } {
  const subject = "Your CDLA.jobs matches";
  const html =
    input.matchCount > 0
      ? matchesBody(input)
      : zeroMatchesBody(input);
  return { subject, html };
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

function matchesBody(input: CandidateEmailInput): string {
  const greeting = input.firstName
    ? `Hey ${escapeHtml(input.firstName)} &mdash;`
    : "Hey there &mdash;";
  const region = resolveRegion(input.cdlState);

  // Spec §2.4: list top 3 carriers, "...and N more" line if more exist.
  // No endorsement language per voice notes §4.3 — just the names.
  const top = input.topCarrierNames.slice(0, 3);
  const carriersList =
    top.length > 0
      ? `
    <ul style="margin: 12px 0; padding-left: 22px;">
      ${top.map((c) => `<li>${escapeHtml(c)}</li>`).join("\n      ")}
    </ul>
    ${input.matchCount > top.length ? `<p style="margin: 8px 0;">&hellip;and ${input.matchCount - top.length} more.</p>` : ""}
  `
      : "";

  const inner = `
    <p>${greeting}</p>

    <p>Thanks for finishing your intake. Here&rsquo;s where you stand.</p>

    <p><strong>You matched ${input.matchCount} ${input.matchCount === 1 ? "carrier" : "carriers"} hiring CDL-A drivers in ${escapeHtml(region)}.</strong></p>
    ${carriersList}

    <p style="margin: 24px 0;">
      <a href="${escapeHtml(input.matchesUrl)}" style="display: inline-block; background: #1F3A5F; color: #ffffff; padding: 12px 22px; border-radius: 6px; font-weight: 600; text-decoration: none;">See my matches</a>
    </p>

    <p><strong>What happens next:</strong> when you click into a carrier you&rsquo;re interested in, we&rsquo;ll ask three quick safety questions specific to that carrier (tickets, accidents, criminal history). After that, we send your prequalification to the carrier and you finish their application directly with them. We never send your info anywhere you didn&rsquo;t pick.</p>

    <p>If you stopped partway through the chat or form, your matches will still be here when you come back &mdash; just log in.</p>

    <p style="margin-top: 22px;">&mdash; The CDLA.jobs team</p>
  `.trim();

  return shell(inner);
}

function zeroMatchesBody(input: CandidateEmailInput): string {
  const greeting = input.firstName
    ? `Hey ${escapeHtml(input.firstName)} &mdash;`
    : "Hey there &mdash;";
  const region = resolveRegion(input.cdlState);

  // Spec §2.5 verbatim, with the intake-edit button linking to /intake
  // (we don't have /intake/edit as a route; re-submitting intake with
  // the same email upserts the profile).
  const intakeEditUrl = input.matchesUrl.replace(
    /\/matches\/[^/]+$/,
    "/intake",
  );

  const inner = `
    <p>${greeting}</p>

    <p>Thanks for finishing your intake. Honest update on where you stand.</p>

    <p><strong>We don&rsquo;t have matches for your profile in ${escapeHtml(region)} right now.</strong> Not a rejection &mdash; just the current state of which carriers are hiring drivers like you in your area. The matching engine looks every day, and the second something fits we&rsquo;ll email you.</p>

    <p>Two things that might help:</p>

    <p><strong>1. Update your preferences.</strong> If you&rsquo;re open to more regions, different equipment, or you have endorsements you didn&rsquo;t list, that opens up the match pool.</p>

    <p style="margin: 16px 0;">
      <a href="${escapeHtml(intakeEditUrl)}" style="display: inline-block; background: #1F3A5F; color: #ffffff; padding: 12px 22px; border-radius: 6px; font-weight: 600; text-decoration: none;">Update my preferences</a>
    </p>

    <p><strong>2. Wait.</strong> New carriers join the platform constantly. Drivers in your exact situation often see matches appear within a few weeks as we expand coverage.</p>

    <p>No matches today doesn&rsquo;t mean no matches ever. We&rsquo;ll keep watching.</p>

    <p style="margin-top: 22px;">&mdash; The CDLA.jobs team</p>
  `.trim();

  return shell(inner);
}
