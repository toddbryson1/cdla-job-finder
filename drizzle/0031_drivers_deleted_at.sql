-- Soft-delete column for driver-requested data deletion (CCPA right
-- to delete / GDPR Art. 17). Set by /me/delete when the driver
-- confirms; same server action that flips this also nulls out the
-- PII columns (firstName, lastName, email, phone, address_*) so any
-- subsequent leak / SQL dump doesn't carry recoverable identity.
--
-- We do NOT cascade-delete the driver's applications / matches /
-- partner_application_stages rows. Those are anonymized by virtue
-- of the driver row's PII going null; we keep the relational shape
-- so the funnel metrics on /admin don't retroactively rewrite when
-- a driver opts out months later. This matches the soft-delete
-- pattern most regulators accept (anonymization satisfies the
-- "right to erasure" when full deletion would corrupt other lawful
-- records).
--
-- Partial index lets the email runners + matching engine + /me
-- and /matches gates filter "active drivers only" cheaply:
--   WHERE deleted_at IS NULL

ALTER TABLE "drivers"
        ADD COLUMN "deleted_at" timestamp with time zone;

CREATE INDEX "drivers_deleted_at_idx"
        ON "drivers" ("deleted_at")
        WHERE "deleted_at" IS NOT NULL;
