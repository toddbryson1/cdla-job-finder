-- Tracks every (driver, job) Stage 2 pursuit. A row is created the first
-- time a driver clicks "Continue to apply" on a carrier and clears the
-- consent screen. Subsequent visits update the same row (one row per
-- (driver, job) pair).
--
-- This replaces the limitation of driver.stage_2_consent_carrier_id which
-- only held the most recent consent. The driver row's Stage 2 consent
-- fields stay around for now as a quick reference to the latest consent;
-- the per-application history lives here.

CREATE TABLE "driver_carrier_applications" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "driver_id" uuid NOT NULL,
        "job_id" uuid NOT NULL,
        "carrier_id" uuid NOT NULL,
        "consented_at" timestamp with time zone DEFAULT now() NOT NULL,
        "consent_text_version" text NOT NULL,
        "tcpa_opt_in" boolean DEFAULT false NOT NULL,
        "last_qualified" boolean,
        "last_qualified_at" timestamp with time zone,
        "last_qualification_reasons" text[],
        CONSTRAINT "driver_carrier_applications_driver_id_drivers_id_fk"
                FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id")
                ON DELETE CASCADE,
        CONSTRAINT "driver_carrier_applications_job_id_carrier_jobs_id_fk"
                FOREIGN KEY ("job_id") REFERENCES "public"."carrier_jobs"("id")
                ON DELETE CASCADE,
        CONSTRAINT "driver_carrier_applications_carrier_id_carriers_id_fk"
                FOREIGN KEY ("carrier_id") REFERENCES "public"."carriers"("id")
                ON DELETE CASCADE,
        CONSTRAINT "driver_carrier_applications_driver_job_uniq"
                UNIQUE ("driver_id", "job_id")
);--> statement-breakpoint

CREATE INDEX "driver_carrier_applications_driver_idx"
        ON "driver_carrier_applications" USING btree ("driver_id", "consented_at" DESC);--> statement-breakpoint
CREATE INDEX "driver_carrier_applications_carrier_idx"
        ON "driver_carrier_applications" USING btree ("carrier_id");
