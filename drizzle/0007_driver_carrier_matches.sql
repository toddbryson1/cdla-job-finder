-- Persistent record of (driver, job) matches. One row per pair; matched_at
-- is when the driver first saw this match. Needed for two things:
--   1. Tier 1 24-hour exclusivity (getFirstMatchTime queries this table)
--   2. Aggregate stats on landing pages (recent match volume, etc.)

CREATE TABLE "driver_carrier_matches" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "driver_id" uuid NOT NULL,
        "job_id" uuid NOT NULL,
        "carrier_id" uuid NOT NULL,
        "matched_at" timestamp with time zone DEFAULT now() NOT NULL,
        "soft_rank_score" numeric(6, 3),
        "distance_miles_from_driver_home" numeric(7, 1),
        CONSTRAINT "driver_carrier_matches_driver_id_drivers_id_fk"
                FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id")
                ON DELETE CASCADE,
        CONSTRAINT "driver_carrier_matches_job_id_carrier_jobs_id_fk"
                FOREIGN KEY ("job_id") REFERENCES "public"."carrier_jobs"("id")
                ON DELETE CASCADE,
        CONSTRAINT "driver_carrier_matches_carrier_id_carriers_id_fk"
                FOREIGN KEY ("carrier_id") REFERENCES "public"."carriers"("id")
                ON DELETE CASCADE,
        CONSTRAINT "driver_carrier_matches_driver_job_uniq" UNIQUE ("driver_id", "job_id")
);--> statement-breakpoint

CREATE INDEX "driver_carrier_matches_driver_matched_idx"
        ON "driver_carrier_matches" USING btree ("driver_id", "matched_at" DESC);--> statement-breakpoint
CREATE INDEX "driver_carrier_matches_driver_carrier_idx"
        ON "driver_carrier_matches" USING btree ("driver_id", "carrier_id", "matched_at");--> statement-breakpoint
CREATE INDEX "driver_carrier_matches_job_idx"
        ON "driver_carrier_matches" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "driver_carrier_matches_matched_at_idx"
        ON "driver_carrier_matches" USING btree ("matched_at");
