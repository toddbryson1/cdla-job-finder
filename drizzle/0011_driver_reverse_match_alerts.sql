-- Tracks reverse-match alert sends per driver (the "new carrier matches
-- you" email that fires when an existing driver's match list grows because
-- new jobs were added via the Swift sync — or any future feed).
--
-- Read by /api/cron/reverse-matches:
--   - to detect new matches since the last alert (matched_at > sent_at)
--   - to enforce the weekly cap (max 3 alerts per driver per rolling 7 days)
-- Per the candidate-email + reverse-match spec §3.3.

CREATE TABLE "driver_reverse_match_alerts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "driver_id" uuid NOT NULL,
        "sent_at" timestamp with time zone DEFAULT now() NOT NULL,
        "new_match_count" integer NOT NULL,
        "status" text DEFAULT 'sent' NOT NULL,
        "skip_reason" text,
        "ghl_message_id" text,
        "error_message" text,
        CONSTRAINT "driver_reverse_match_alerts_driver_id_drivers_id_fk"
                FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id")
                ON DELETE CASCADE
);--> statement-breakpoint

CREATE INDEX "driver_reverse_match_alerts_driver_sent_idx"
        ON "driver_reverse_match_alerts" USING btree ("driver_id", "sent_at" DESC);
