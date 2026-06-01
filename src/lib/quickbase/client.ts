// Sterling Recruiting Solutions QuickBase REST client.
//
// Pushes Type 1 (non-FCRA-regulated) driver data to Sterling's
// QuickBase via POST https://api.quickbase.com/v1/records. Used as
// the post-application handoff for Anderson Trucking Service per
// spec docs/SPEC_anderson-application-handoff-addendum-v2.md
// §B5.1–§B5.6.
//
// AUTHENTICATION (spec §B5.1):
//   The Authorization header is `QB-USER-TOKEN ${token}` where the
//   token is a Sterling-issued QuickBase User Token (NOT a
//   username/password). Generated from QuickBase UI →
//   My Preferences → Manage User Tokens, scoped to Sterling's app.
//   Token lives in env var QUICKBASE_STERLING_API_TOKEN.
//
// FEATURE FLAG (spec §B11):
//   The push is gated by QUICKBASE_PUSH_ENABLED='true'. Until counsel
//   clears the QuickBase API push pattern (Anderson is a new
//   compliance pattern not yet attorney-reviewed), the flag stays
//   false and isQuickbaseConfigured() returns false. The Anderson
//   handoff handler still records the partner_application_stages
//   row in either case — only the push itself is gated.
//
// SCHEMA GAPS WE KNOW ABOUT:
//   - Spec §B5.4: drivers table has no street/city/state column
//     today (only home_zip). When QB requires Street/City/State, we
//     pass NULL for now and flag as a TODO. Per spec, Stage 2 should
//     collect street/city; that's a downstream task.
//   - Spec §B10 Q3: EXPERIENCE LEVEL dropdown values not yet
//     confirmed by Sterling. The deriveExperienceLevel() function
//     uses placeholder strings; Sterling-side confirmation will
//     unlock production-ready values.
//   - Spec §B10 Q5: Driver Applying For accepted values not yet
//     confirmed. We pass position_title as-is and let Sterling
//     reject if shape doesn't match.

import type {
  drivers,
  carrierJobs,
  partnerApplicationStages,
} from "@/db/schema";

const QUICKBASE_API_BASE = "https://api.quickbase.com/v1";
const QUICKBASE_RECORDS_PATH = "/records";

export interface QuickbaseHandoffInput {
  driver: typeof drivers.$inferSelect;
  carrierJob: typeof carrierJobs.$inferSelect;
  stage: typeof partnerApplicationStages.$inferSelect;
  // From the carriers.partner_handoff_config.quickbase blob.
  // Whole record so the caller doesn't need to repeatedly pull
  // realm_hostname / app_id / table_id from the same JSON.
  quickbaseConfig: {
    realm_hostname: string;
    app_id: string;
    table_id: string;
    default_recruiter_name: string;
  };
}

export type QuickbasePushResult =
  | { ok: true; recordId: string }
  | {
      ok: false;
      code: "not_configured" | "no_retry" | "retryable" | "auth";
      error: string;
    };

/**
 * Whether the QuickBase push is configured AND feature-flagged on.
 * Pre-attorney-review (default) this returns false even with a token
 * present — the flag intentionally gates production rollout.
 */
export function isQuickbaseConfigured(): boolean {
  const token = process.env.QUICKBASE_STERLING_API_TOKEN;
  const enabled = process.env.QUICKBASE_PUSH_ENABLED;
  return Boolean(token) && enabled === "true";
}

/**
 * Map driver.years_held (numeric) to one of Sterling's QuickBase
 * EXPERIENCE LEVEL dropdown values. The accepted values are NOT
 * yet confirmed by Sterling (spec §B10 Q3) — these are placeholder
 * strings drawn from common industry conventions. Sterling-side
 * confirmation will replace these.
 *
 * TODO(spec §B10 Q3): Replace placeholder strings with the exact
 * accepted dropdown values once Sterling confirms.
 */
export function deriveExperienceLevel(yearsHeld: number): string {
  if (yearsHeld < 1) return "Less than 1 year";
  if (yearsHeld < 2) return "1-2 years";
  if (yearsHeld < 5) return "2-5 years";
  return "5+ years";
}

/**
 * Map field labels (per spec §B5.2) to QuickBase field IDs. The IDs
 * are determined by Sterling's QuickBase schema — until Sterling
 * provides the canonical field-id map, the client uses the human
 * label as the key. QuickBase's field-id-keyed payload (`{"6":
 * {"value": "..."}, ...}`) replaces this once we have the map.
 *
 * TODO(spec §B5.2): Replace label-keyed payload with field-id-
 * keyed payload once Sterling provides the field map.
 */
function buildRecordPayload(input: QuickbaseHandoffInput): {
  to: string;
  data: Array<Record<string, { value: unknown }>>;
} {
  const { driver, carrierJob, stage, quickbaseConfig } = input;

  const matchDate = new Date().toISOString().slice(0, 10);
  // Spec §B5.5 — Notes content. The Matched job line is load-bearing:
  // it tells Sterling which Anderson product the driver was matched
  // to when the single-IntelliApp-URL ambiguity (spec §B10 Q1) is
  // not yet resolved.
  const notes = [
    `Match received via CDLA.jobs on ${matchDate}. Driver completed Stage 2 consent and qualifying questions, then was directed to Anderson IntelliApp.`,
    `CDLA.jobs match ID: ${stage.id}.`,
    `Matched job: ${carrierJob.positionTitle}.`,
  ].join(" ");

  const yearsHeld = Number(driver.yearsHeld ?? 0);

  const record: Record<string, { value: unknown }> = {
    // Hardcoded per spec §B5.2 — exact value Sterling expects (legal
    // name vs. "Anderson") is open per §B10 Q6.
    Company: { value: "Anderson" },
    "First Name": { value: driver.firstName ?? "" },
    "Last Name": { value: driver.lastName ?? "" },
    "Cell Phone": { value: driver.phone ?? "" },
    Email: { value: driver.email ?? "" },
    // Street is a known schema gap (spec §B5.4 + B9 item: drivers
    // table has no address_street column today). Send empty string
    // until Stage 2 starts collecting it.
    Street: { value: "" },
    // City/State also not on the drivers row today — only home_zip.
    // We could reverse-geocode zip→city/state but that's premature
    // until Sterling confirms the field shape. Sending empty.
    City: { value: "" },
    State: { value: "" },
    Zip: { value: driver.homeZip ?? "" },
    Notes: { value: notes },
    "EXPERIENCE LEVEL": { value: deriveExperienceLevel(yearsHeld) },
    "Driver Applying For": { value: carrierJob.positionTitle },
    "Recruiter Name": { value: quickbaseConfig.default_recruiter_name },
  };

  return {
    to: quickbaseConfig.table_id,
    data: [record],
  };
}

/**
 * Push an Anderson handoff to Sterling's QuickBase. Returns a
 * tagged-union outcome so the caller can decide stage transitions:
 *
 *   { ok: true, recordId }                  → submitted_to_sterling
 *   { ok: false, code: 'no_retry' }         → submit_failed_validation
 *   { ok: false, code: 'retryable' }        → submit_queued_for_retry
 *   { ok: false, code: 'auth' }             → alert ops, pause queue
 *   { ok: false, code: 'not_configured' }   → quietly skip the push
 *
 * Spec §B6.3 — failure semantics. Never throws to the caller; all
 * errors come back as tagged results.
 *
 * Production note (spec §B11): until attorney review clears the
 * pattern, isQuickbaseConfigured() returns false and this function
 * short-circuits to { ok: false, code: 'not_configured' }. The
 * Anderson handoff handler still records the
 * partner_application_stages row in that case — Sterling just
 * doesn't get the push until the flag flips on.
 */
export async function pushAndersonHandoff(
  input: QuickbaseHandoffInput,
): Promise<QuickbasePushResult> {
  if (!isQuickbaseConfigured()) {
    return {
      ok: false,
      code: "not_configured",
      error:
        "QUICKBASE_PUSH_ENABLED is not 'true' or QUICKBASE_STERLING_API_TOKEN is empty. Push is gated on attorney review per spec §B11.",
    };
  }

  const token = process.env.QUICKBASE_STERLING_API_TOKEN!;
  const payload = buildRecordPayload(input);

  let resp: Response;
  try {
    resp = await fetch(`${QUICKBASE_API_BASE}${QUICKBASE_RECORDS_PATH}`, {
      method: "POST",
      headers: {
        // Spec §B5.1: User Token auth header is `QB-USER-TOKEN ${token}`.
        Authorization: `QB-USER-TOKEN ${token}`,
        "QB-Realm-Hostname": input.quickbaseConfig.realm_hostname,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    // Network error — treat as 5xx-equivalent per spec §B6.3.
    return {
      ok: false,
      code: "retryable",
      error: `network: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (resp.status === 401 || resp.status === 403) {
    // Spec §B6.3: 401 alerts ops and pauses the push queue. The
    // handler upstream decides what to do with the alert.
    const body = await readBodySafe(resp);
    return {
      ok: false,
      code: "auth",
      error: `quickbase ${resp.status}: ${body}`,
    };
  }

  if (resp.status >= 400 && resp.status < 500) {
    // Validation error. Do NOT auto-retry — log and surface for ops.
    const body = await readBodySafe(resp);
    return {
      ok: false,
      code: "no_retry",
      error: `quickbase ${resp.status}: ${body}`,
    };
  }

  if (resp.status >= 500) {
    const body = await readBodySafe(resp);
    return {
      ok: false,
      code: "retryable",
      error: `quickbase ${resp.status}: ${body}`,
    };
  }

  // 2xx — success. Pull the QuickBase record ID out of the response.
  // QuickBase's POST /v1/records returns { metadata: { createdRecordIds: [n] } }.
  let bodyJson: unknown;
  try {
    bodyJson = await resp.json();
  } catch {
    return {
      ok: false,
      code: "no_retry",
      error: "quickbase returned 2xx with unparseable body",
    };
  }
  const recordId = extractRecordId(bodyJson);
  if (!recordId) {
    return {
      ok: false,
      code: "no_retry",
      error: "quickbase 2xx response missing createdRecordIds",
    };
  }
  return { ok: true, recordId };
}

async function readBodySafe(resp: Response): Promise<string> {
  try {
    return (await resp.text()).slice(0, 500);
  } catch {
    return "<unreadable body>";
  }
}

function extractRecordId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const metadata = (body as { metadata?: unknown }).metadata;
  if (!metadata || typeof metadata !== "object") return null;
  const ids = (metadata as { createdRecordIds?: unknown }).createdRecordIds;
  if (!Array.isArray(ids) || ids.length === 0) return null;
  const first = ids[0];
  if (typeof first === "string") return first;
  if (typeof first === "number") return String(first);
  return null;
}
