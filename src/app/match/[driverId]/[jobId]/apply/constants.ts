// The version of the Stage 2 consent language the driver agreed to.
// Persisted with each consent event so we can audit which text a driver
// saw. BUMP this whenever the consent copy materially changes.
//
// v2 (2026-06-10): blanket scope — the consent now authorizes sharing
// with the selected carrier AND any other carriers the driver chooses to
// apply to through CDLA.jobs, now or in the future. A driver who consents
// under this version isn't re-shown the full authorization for subsequent
// carriers (they get a short "already authorized — continue" confirm that
// still records a per-carrier application). A driver who last consented
// under an earlier version sees the full v2 authorization on their next
// apply. NOTE: the exact legal wording in ConsentBlock should be confirmed
// by counsel before being relied on.
export const STAGE_2_CONSENT_TEXT_VERSION = "v2-2026-06-10-blanket";
