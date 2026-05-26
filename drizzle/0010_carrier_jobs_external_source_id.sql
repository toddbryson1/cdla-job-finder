-- External source identifier for carrier_jobs rows that originate from
-- a third-party feed (Smartsheet, Tenstreet, etc.). Used to upsert on
-- re-sync so external feeds don't create duplicate rows.
--
-- Partial unique index lets existing seed rows (which have NULL
-- external_source_id) coexist with feed-sourced rows.

ALTER TABLE "carrier_jobs" ADD COLUMN "external_source_id" text;--> statement-breakpoint

CREATE UNIQUE INDEX "carrier_jobs_external_source_uniq"
        ON "carrier_jobs" USING btree ("external_source_id")
        WHERE "external_source_id" IS NOT NULL;
