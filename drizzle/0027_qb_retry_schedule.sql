-- Add a quickbase_next_retry_at column to partner_application_stages
-- so the QB retry sweeper can pick up `submit_queued_for_retry` rows
-- when their backoff window has elapsed. Spec §B6.3 wants
-- 5min/30min/2h/12h/24h cadence; the column makes that addressable
-- by indexed query rather than table scan.
--
-- NULL means "not currently queued for retry" — that covers every
-- terminal state (submitted_to_sterling / submit_failed_validation /
-- stalled) and pre-retry-feature rows.
--
-- Index lets the sweeper run cheap on small batches:
--   SELECT … WHERE stage = 'submit_queued_for_retry'
--           AND quickbase_next_retry_at <= now()
--   ORDER BY quickbase_next_retry_at
--   LIMIT 50;

ALTER TABLE "partner_application_stages"
        ADD COLUMN "quickbase_next_retry_at" timestamp with time zone;

CREATE INDEX "partner_application_stages_retry_due_idx"
        ON "partner_application_stages" ("quickbase_next_retry_at")
        WHERE "stage" = 'submit_queued_for_retry'
          AND "quickbase_next_retry_at" IS NOT NULL;
