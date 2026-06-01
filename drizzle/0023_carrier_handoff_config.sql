-- Per-carrier handoff configuration + Stage 2 result page copy override.
--
-- partner_handoff_config: per-carrier configuration for handing
--   driver leads off to the carrier's downstream system (Tenstreet
--   IntelliApp URL, recruiter param values, source identifiers, and
--   any partner-specific tracking-system config like Anderson's
--   Sterling Recruiting Solutions QuickBase target).
--
--   The actual API tokens / secrets do NOT live here. They live in
--   environment variables; this config holds the *reference* (e.g.
--   `api_token_secret_ref: "QUICKBASE_STERLING_API_TOKEN"`) so each
--   carrier can name their own env var.
--
--   Initial consumers: Anderson Trucking Service (Sterling/QuickBase
--   push). Spec source: docs/SPEC_anderson-application-handoff-
--   addendum-v2.md §B4.5.
--
-- result_page_copy_overrides: per-carrier overrides for the Stage 2
--   result page copy. Most carriers use the generic template; a few
--   (Anderson, future Tier 1 partners) get small per-carrier
--   adjustments to the visible copy. JSON shape:
--
--     { "field_name": "override string" }
--
--   The Stage 2 result page checks this JSON for a known set of
--   override keys (e.g. recruiter_team_name, source_id_instruction)
--   and falls through to the generic copy when null/empty.

ALTER TABLE "carriers"
        ADD COLUMN "partner_handoff_config" jsonb,
        ADD COLUMN "result_page_copy_overrides" jsonb;
