-- Advisor-mode driver preference layer.
--
-- The neutral-matcher intake captured what a driver IS (experience,
-- equipment, record) but barely captured what a driver WANTS. This
-- migration adds the wants/needs layer that turns the database from a
-- resume store into a wants-and-needs engine, so Debbie (advisor mode)
-- can rank to the human instead of guessing.
--
-- Source: docs SPEC_driver-preference-and-demand-database-v1.md §3.4-3.5.
--
-- priority_ranking is the KEYSTONE — the driver's own ordering of what
-- matters most, e.g. ARRAY['home_time','pay','proximity','ease_of_hire'].
-- It's what lets the matcher resolve the Swift/JB-Hunt tradeoff (good
-- home time, lower pay) for THIS driver. §4.
--
-- All columns are nullable: legacy driver rows and the current intake
-- stay valid; these populate only when a driver answers the advisor
-- follow-up questions (or the equivalent form-fallback step).
--
-- Prequalification boundary unchanged: still NO SSN / DOB / license
-- numbers / FCRA-regulated consents stored.
--
-- Reused-not-duplicated (documented in src/db/schema.ts): home_time[]
-- = schedule_priority, willing_to_relocate = domicile_flexibility,
-- desired_equipment[] = equipment_preference. pay_floor_* is kept
-- DISTINCT from the hard-filter min_weekly_pay and is never surfaced
-- to a driver as a promise.
--
-- The re-match fields drive the lifelong-advocate loop (§7): when a new
-- carrier partners or posts a fitting lane, stored eligible profiles are
-- re-run. matches_shown/clicked already live in driver_carrier_matches +
-- driver_external_job_impressions + driver_carrier_applications; these
-- are the scheduling + no-match-reason fields those tables don't carry.

CREATE TYPE "career_goal_type" AS ENUM (
        'more_pay',
        'different_equipment',
        'endorsement',
        'home_time',
        'own_authority',
        'none'
);
--> statement-breakpoint
ALTER TABLE "drivers"
        ADD COLUMN "priority_ranking" text[],
        ADD COLUMN "pay_floor_min_weekly_usd" integer,
        ADD COLUMN "pay_floor_max_weekly_usd" integer,
        ADD COLUMN "max_time_out_days" integer,
        ADD COLUMN "dealbreakers" text[],
        ADD COLUMN "career_goal_type" "career_goal_type",
        ADD COLUMN "career_goal_detail" text,
        ADD COLUMN "re_match_eligible" boolean DEFAULT false NOT NULL,
        ADD COLUMN "next_re_match_check_at" timestamp with time zone,
        ADD COLUMN "no_match_reason" text,
        ADD COLUMN "last_active_at" timestamp with time zone;
