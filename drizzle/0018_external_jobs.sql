-- Cache table for jobs sourced from external aggregators (Adzuna for
-- now). Drivers in zero-supply regions need *something* to look at, so
-- when our internal match count is < 5 we top up with public listings
-- via the Adzuna API and store the results here.
--
-- Why a cache: Adzuna's free tier is 1,000 calls/month. Two drivers
-- with the same lat/lng (rounded to 0.5°) + equipment shouldn't burn
-- two API calls. 24-hour TTL — that's the cadence at which Adzuna's
-- aggregated listings turn over anyway.
--
-- Why one row per listing (not one row per query+listing): we want to
-- count impressions across drivers per external listing, and we want
-- to dedupe by (source, source_id) so the same Indeed posting surfaced
-- by Adzuna twice from different queries doesn't show twice.
--
-- These listings are PUBLIC and we have no relationship with the
-- hiring carrier — the apply CTA links straight to redirect_url. We
-- never share driver info with these carriers.

CREATE TABLE "external_jobs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "source" text NOT NULL,
        "source_id" text NOT NULL,
        "title" text NOT NULL,
        "company_name" text,
        "city" text,
        "state" varchar(2),
        "lat" numeric(9, 6),
        "lng" numeric(9, 6),
        "equipment_guess" text,
        "salary_min_annual_usd" integer,
        "salary_max_annual_usd" integer,
        "salary_is_predicted" boolean NOT NULL DEFAULT false,
        "description_excerpt" text,
        "redirect_url" text NOT NULL,
        "posted_at" timestamp with time zone,
        "fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "external_jobs_source_source_id_uniq" UNIQUE ("source", "source_id")
);--> statement-breakpoint

CREATE INDEX "external_jobs_geo_idx"
        ON "external_jobs" USING btree ("lat", "lng");--> statement-breakpoint
CREATE INDEX "external_jobs_equipment_idx"
        ON "external_jobs" USING btree ("equipment_guess");--> statement-breakpoint
CREATE INDEX "external_jobs_fetched_at_idx"
        ON "external_jobs" USING btree ("fetched_at");--> statement-breakpoint

-- One row per (driver, external_job) impression. Mirrors
-- driver_carrier_matches but for external listings. Lets us measure
-- whether external jobs are actually getting clicked through.
CREATE TABLE "driver_external_job_impressions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "driver_id" uuid NOT NULL,
        "external_job_id" uuid NOT NULL,
        "shown_at" timestamp with time zone DEFAULT now() NOT NULL,
        "click_through_at" timestamp with time zone,
        CONSTRAINT "driver_external_job_impressions_driver_id_drivers_id_fk"
                FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id")
                ON DELETE CASCADE,
        CONSTRAINT "driver_external_job_impressions_external_job_id_external_jobs_id_fk"
                FOREIGN KEY ("external_job_id") REFERENCES "public"."external_jobs"("id")
                ON DELETE CASCADE,
        CONSTRAINT "driver_external_job_impressions_driver_job_uniq"
                UNIQUE ("driver_id", "external_job_id")
);--> statement-breakpoint

CREATE INDEX "driver_external_job_impressions_driver_idx"
        ON "driver_external_job_impressions" USING btree ("driver_id", "shown_at" DESC);--> statement-breakpoint
CREATE INDEX "driver_external_job_impressions_clicks_idx"
        ON "driver_external_job_impressions" USING btree ("click_through_at")
        WHERE "click_through_at" IS NOT NULL;
