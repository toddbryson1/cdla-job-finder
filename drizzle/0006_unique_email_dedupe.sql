-- One driver per email. Re-submitting intake should update the existing
-- row, not stack new ones (which broke /authenticate lookup-by-email).
--
-- This migration first deletes duplicate rows, keeping only the most recent
-- per email, then adds a unique constraint so future inserts conflict and
-- the API can upsert.

DELETE FROM "drivers" d1
USING "drivers" d2
WHERE d1.email = d2.email
  AND d1.created_at < d2.created_at;--> statement-breakpoint

ALTER TABLE "drivers"
        ADD CONSTRAINT "drivers_email_unique" UNIQUE ("email");
