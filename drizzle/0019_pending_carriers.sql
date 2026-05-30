-- Staging tables for the prospect-carrier ingestion pipeline per
-- SPEC_prospect-carrier-job-ingestion-v1.md §3.2 step 4 + §9 Phase 1.
--
-- The carrier-discovery CLI (scripts/discover-carrier.ts) emits
-- DiscoveredJob[] rows. We persist those into these staging tables
-- so an admin can review before they hit the live `carriers` +
-- `carrier_jobs` tables that drive driver matches.
--
-- Why staging (vs. inserting straight into carrier_jobs):
--   - Crawler output has variable quality; review is the safety net
--   - Application-surface misclassification would route drivers wrong
--   - Lets us land the data + iterate on extraction without polluting
--     the live matching set
--
-- Idempotency contract:
--   - pending_carriers UNIQUE on lower(name); re-discovery upserts
--   - pending_carrier_jobs replaced wholesale per discovery run
--     (one staging row per discovered job; old rows for the same
--     pending_carrier are deleted before inserting fresh)

CREATE TYPE "pending_carrier_status" AS ENUM (
        'pending',
        'approved',
        'rejected',
        'duplicate'
);--> statement-breakpoint

CREATE TABLE "pending_carriers" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "name" text NOT NULL,
        "homepage_url" text NOT NULL,
        "careers_url" text,
        "status" "pending_carrier_status" NOT NULL DEFAULT 'pending',
        "notes" text,
        "reviewer_email" text,
        "discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
        "reviewed_at" timestamp with time zone,
        -- The full attempts[] from DiscoveryReport so reviewers can
        -- see which sources hit (json_ld vs adzuna_company) and why.
        "discovery_attempts" jsonb NOT NULL DEFAULT '[]'::jsonb,
        -- When this pending carrier was promoted to live, point at
        -- the resulting carriers.id so we don't promote twice.
        "promoted_carrier_id" uuid REFERENCES "carriers"("id") ON DELETE SET NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX "pending_carriers_name_uniq"
        ON "pending_carriers" (LOWER("name"));--> statement-breakpoint
CREATE INDEX "pending_carriers_status_idx"
        ON "pending_carriers" ("status", "discovered_at" DESC);--> statement-breakpoint

CREATE TABLE "pending_carrier_jobs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "pending_carrier_id" uuid NOT NULL
                REFERENCES "pending_carriers"("id") ON DELETE CASCADE,
        -- "json_ld" or "adzuna_company" — matches DiscoveredJob.source.
        "source" text NOT NULL,
        "source_id" text NOT NULL,
        "title" text NOT NULL,
        "description" text,
        "carrier_name_raw" text,
        "city" text,
        "state" varchar(2),
        "lat" numeric(9, 6),
        "lng" numeric(9, 6),
        "equipment_guess" text,
        "pay_min_weekly_usd" integer,
        "pay_max_weekly_usd" integer,
        "pay_original_period" text,
        "apply_url" text NOT NULL,
        "posted_at" timestamp with time zone,
        -- Application-surface classification result (per spec §5.2).
        -- Stored as text since the live enum has migration cost; the
        -- promoter casts to the enum at INSERT time.
        "application_surface" text NOT NULL DEFAULT 'unknown',
        "discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "pending_carrier_jobs_source_uniq"
                UNIQUE ("pending_carrier_id", "source", "source_id")
);--> statement-breakpoint

CREATE INDEX "pending_carrier_jobs_pending_idx"
        ON "pending_carrier_jobs" ("pending_carrier_id");
