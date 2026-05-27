-- Job posting cycles — one row per public-facing URL for a (carrier_job,
-- city) at a specific 20-day window. Each cycle:
--   - drives one /job/[slug] URL (slug encodes this row's id prefix)
--   - has its own posted_at (Google's datePosted) and expires_at
--     (posted_at + 20 days, used as validThrough)
--   - rotates the description variant on repost (variant_index)
--
-- Lifecycle:
--   1. New active carrier_job → spawn cycle 1 in domicile_city, primary=true
--   2. After 20 days, status flips to 'expired' (URL 404s, dropped from sitemap)
--   3. 3 days later (if job still active) → new cycle in a different
--      candidate city ≥50 mi from any other active cycle for the job;
--      the "primary" cycle rotates across cities to broaden SERP coverage
--   4. Up to N simultaneous cycles per job (each its own URL, each its
--      own city ≥50 mi from the others) so we rank in multiple metros
--
-- One ACTIVE cycle per (job_id, city, state) — enforced by a partial
-- unique index. Expired cycles accumulate (audit log + rotation memory).

CREATE TYPE "job_posting_cycle_status" AS ENUM ('active', 'expired');

CREATE TABLE "job_posting_cycles" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "job_id" uuid NOT NULL,
        "city" text NOT NULL,
        "state" varchar(2) NOT NULL,
        "zip" varchar(5),
        "lat" numeric(9, 6),
        "lng" numeric(9, 6),
        "cycle_index" integer NOT NULL,
        "variant_index" integer NOT NULL DEFAULT 0,
        "is_primary" boolean NOT NULL DEFAULT false,
        "posted_at" timestamp with time zone NOT NULL DEFAULT now(),
        "expires_at" timestamp with time zone NOT NULL,
        "status" "job_posting_cycle_status" NOT NULL DEFAULT 'active',
        "created_at" timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT "job_posting_cycles_job_id_carrier_jobs_id_fk"
                FOREIGN KEY ("job_id") REFERENCES "public"."carrier_jobs"("id")
                ON DELETE CASCADE
);--> statement-breakpoint

CREATE INDEX "job_posting_cycles_status_expires_idx"
        ON "job_posting_cycles" USING btree ("status", "expires_at");--> statement-breakpoint

CREATE INDEX "job_posting_cycles_job_idx"
        ON "job_posting_cycles" USING btree ("job_id");--> statement-breakpoint

CREATE INDEX "job_posting_cycles_job_status_idx"
        ON "job_posting_cycles" USING btree ("job_id", "status");--> statement-breakpoint

CREATE UNIQUE INDEX "job_posting_cycles_active_uniq"
        ON "job_posting_cycles" USING btree ("job_id", "city", "state")
        WHERE "status" = 'active';
