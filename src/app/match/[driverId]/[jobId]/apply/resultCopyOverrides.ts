// Stage 2 result-page copy overrides — pulled from
// carriers.result_page_copy_overrides (jsonb). Most carriers have this
// column null and get the generic IntelliApp result copy. A few
// partners (Anderson is the first; others may follow) provide a small
// per-carrier wording override stored as a known-shape JSON blob.
//
// IMPORTANT: the rendering layer must NEVER hardcode a carrier name.
// All carrier-specific wording flows through this typed shape; the
// carrier's display name comes from carriers.name on the row.
//
// Spec source: docs/SPEC_anderson-application-handoff-addendum-v2.md
// §B8 ("Driver-facing experience"). Migration: drizzle/0023.

export interface ResultPageCopyOverrides {
  /**
   * Phrase used in the post-application "you'll hear from {team}"
   * sentence. Defaults to "{carrierName}'s recruiting team" when the
   * override is null. Anderson uses "Anderson's recruiting team".
   */
  recruiterTeamName: string | null;

  /**
   * When true, suppress the "select Other and type the source
   * identifier" guidance in the generic IntelliApp copy. Carriers
   * whose IntelliApp URL already pre-codes the source via query
   * params (uri_b, etc.) don't need the driver to type anything —
   * Anderson is the first example.
   */
  omitSourceIdInstruction: boolean;

  /**
   * Bulleted "before you start, make sure you have" list rendered
   * above the apply button. When null, falls back to the generic
   * two-bullet list. Anderson supplies its own 2-item list per §B8.
   */
  beforeYouStartItems: string[] | null;

  /**
   * Phrase rendered in the "their team will be in touch {phrase}"
   * sentence below the apply button. Defaults to "within 1–2 business
   * days" when null. Anderson supplies the same phrase explicitly to
   * lock the wording.
   */
  followupPromise: string | null;
}

/**
 * Parse the jsonb blob from carriers.result_page_copy_overrides into
 * a typed override object. Returns a fully-defaulted shape (all
 * fields null / omit=false) when the input is null, undefined, or
 * shaped wrong — the rendering layer can always read field values
 * without further null checks.
 */
export function parseResultPageCopyOverrides(
  raw: unknown,
): ResultPageCopyOverrides {
  const defaults: ResultPageCopyOverrides = {
    recruiterTeamName: null,
    omitSourceIdInstruction: false,
    beforeYouStartItems: null,
    followupPromise: null,
  };
  if (!raw || typeof raw !== "object") return defaults;
  const obj = raw as Record<string, unknown>;

  return {
    recruiterTeamName:
      typeof obj.recruiter_team_name === "string"
        ? obj.recruiter_team_name
        : defaults.recruiterTeamName,
    omitSourceIdInstruction:
      obj.omit_source_id_instruction === true
        ? true
        : defaults.omitSourceIdInstruction,
    beforeYouStartItems: Array.isArray(obj.before_you_start_items)
      ? (obj.before_you_start_items as unknown[])
          .filter((s): s is string => typeof s === "string" && s.length > 0)
      : defaults.beforeYouStartItems,
    followupPromise:
      typeof obj.followup_promise === "string"
        ? obj.followup_promise
        : defaults.followupPromise,
  };
}
