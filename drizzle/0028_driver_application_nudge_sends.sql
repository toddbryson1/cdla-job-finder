-- Track ad-hoc "you have N matches but haven't applied yet" nudge
-- emails. Separate from driver_nurture_sends (which is the 6-email
-- 30-day-spaced welcome drip) and driver_reverse_match_alerts
-- (which fires when NEW matches appear). This one fires when a
-- driver has matches sitting unused.
--
-- Cadence (handled in code in src/lib/application-nudges.ts):
--   - nudge_index = 1: T + 24h after intake if applications = 0
--   - nudge_index = 2: T + 7d after intake if still applications = 0
--   - No further nudges. The 6-email nurture sequence carries from
--     there if the driver doesn't engage.
--
-- One row per (driver_id, nudge_index) so re-runs of the daily cron
-- don't double-send. UNIQUE constraint enforces it at the DB level.
--
-- status mirrors driver_reverse_match_alerts: sent / skipped /
-- failed. skip_reason is free-text ("zero_matches", "no_email",
-- "weekly_cap", etc.) so the runner summary can show why it
-- skipped without inspecting each row.

CREATE TABLE "driver_application_nudge_sends" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "driver_id" uuid NOT NULL REFERENCES "drivers"("id") ON DELETE CASCADE,
        "nudge_index" integer NOT NULL,
        "sent_at" timestamp with time zone DEFAULT now() NOT NULL,
        "status" text DEFAULT 'sent' NOT NULL,
        "skip_reason" text,
        "ghl_message_id" text,
        "error_message" text,
        "match_count_at_send" integer
);

CREATE UNIQUE INDEX "driver_application_nudge_sends_driver_nudge_uniq"
        ON "driver_application_nudge_sends" ("driver_id", "nudge_index");

CREATE INDEX "driver_application_nudge_sends_driver_sent_idx"
        ON "driver_application_nudge_sends" ("driver_id", "sent_at");
