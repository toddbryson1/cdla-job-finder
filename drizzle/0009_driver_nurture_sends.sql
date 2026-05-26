-- One row per (driver, email index) for the 6-email nurture sequence.
-- When a driver completes intake, /api/intake schedules 6 rows here at
-- intake_date + 30, 60, 90, 120, 150, 180 days. The daily Vercel cron
-- (/api/cron/nurture) finds rows where scheduled_for <= now() and
-- status='pending', sends the email via GHL, and flips status to
-- 'sent' / 'skipped' / 'failed'.

CREATE TABLE "driver_nurture_sends" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "driver_id" uuid NOT NULL,
        "email_index" integer NOT NULL,
        "scheduled_for" timestamp with time zone NOT NULL,
        "sent_at" timestamp with time zone,
        "status" text DEFAULT 'pending' NOT NULL,
        "skip_reason" text,
        "ghl_message_id" text,
        "error_message" text,
        CONSTRAINT "driver_nurture_sends_driver_id_drivers_id_fk"
                FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id")
                ON DELETE CASCADE,
        CONSTRAINT "driver_nurture_sends_driver_email_uniq"
                UNIQUE ("driver_id", "email_index")
);--> statement-breakpoint

CREATE INDEX "driver_nurture_sends_status_scheduled_idx"
        ON "driver_nurture_sends" USING btree ("status", "scheduled_for");--> statement-breakpoint
CREATE INDEX "driver_nurture_sends_driver_idx"
        ON "driver_nurture_sends" USING btree ("driver_id");
