-- TA Dedicated: persisted opening → detail-tab mappings.
--
-- After the §6.1 human review step, confirmed matches go here. The
-- sync orchestrator consults this table first; only divisions WITHOUT
-- a confirmed mapping fall through to fuzzy-match-time. This makes the
-- daily sync deterministic across runs and removes the risk of a tab
-- rename or content change shifting a previously-correct match.
--
-- opening_division_norm is the normalized form of the opening's
-- Division string (lowercase, punctuation stripped, etc.). We key on
-- the normalized form so cosmetic edits to the Division text don't
-- invalidate the mapping.
--
-- One row per (opening_division_norm) is the natural unique key.
-- tab_name = NULL is a valid value meaning "operator confirmed there
-- is no matching tab" — distinguishes a deliberately-unmapped opening
-- from a not-yet-reviewed one.

CREATE TABLE "ta_opening_tab_mappings" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "opening_division_norm" text NOT NULL,
        "opening_division_raw" text NOT NULL,
        "tab_name" text,
        "confidence" numeric(4, 3),
        "confirmed_at" timestamp with time zone NOT NULL DEFAULT now(),
        "confirmed_by" text,
        "notes" text,
        CONSTRAINT "ta_opening_tab_mappings_norm_uniq" UNIQUE ("opening_division_norm")
);

CREATE INDEX "ta_opening_tab_mappings_tab_name_idx"
        ON "ta_opening_tab_mappings" ("tab_name");
