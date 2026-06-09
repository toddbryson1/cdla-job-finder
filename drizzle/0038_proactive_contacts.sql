-- Proactive lifelong-advocate contacts.
--
-- One row per proactive-outreach DECISION: whether it sent, was
-- suppressed by the anti-spam governance spine, or was blocked because
-- PROACTIVE_SENDS_ENABLED is off. This table is both the audit trail and
-- the governance state — the frequency cap, cooldown, and disengagement
-- suppression read a driver's recent rows to decide whether the next
-- contact may fire.
--
-- Every proactive message records WHY it was sent (reason) and clears a
-- materiality gate first. The system errs, every time, toward sending
-- LESS — one spammy "great opportunity!!" blast undoes a year of honest
-- behavior. Sends stay DISABLED (status='blocked_disabled') until A2P
-- 10DLC is confirmed live; the governance spine is built and tested
-- before any send path is enabled (same pattern as the Anderson QB push).
--
-- Source: docs SPEC_debbie-lifelong-advocate-system-v1.md §2-3.

CREATE TABLE "driver_proactive_contacts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "driver_id" uuid NOT NULL REFERENCES "drivers"("id") ON DELETE CASCADE,
        "trigger_type" text NOT NULL,
        "reason" text NOT NULL,
        "channel" text NOT NULL,
        "status" text NOT NULL,
        "skip_reason" text,
        "materiality_detail" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "sent_at" timestamp with time zone
);

CREATE INDEX "driver_proactive_contacts_driver_created_idx"
        ON "driver_proactive_contacts" ("driver_id", "created_at");

CREATE INDEX "driver_proactive_contacts_status_idx"
        ON "driver_proactive_contacts" ("status");
