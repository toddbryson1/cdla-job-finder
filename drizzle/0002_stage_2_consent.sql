-- Stage 2 per-carrier consent fields on the drivers table.
-- Stores the most recent Stage 2 consent. v1 keeps one row per driver; a
-- per-carrier application records table is the long-term home for this.

ALTER TABLE "drivers"
        ADD COLUMN "stage_2_consent_carrier_id" uuid,
        ADD COLUMN "stage_2_consent_at" timestamp with time zone,
        ADD COLUMN "stage_2_consent_text_version" text,
        ADD COLUMN "stage_2_tcpa_opt_in" boolean DEFAULT false;--> statement-breakpoint

ALTER TABLE "drivers"
        ADD CONSTRAINT "drivers_stage_2_consent_carrier_id_carriers_id_fk"
        FOREIGN KEY ("stage_2_consent_carrier_id") REFERENCES "public"."carriers"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION;
