-- Add street/city/state address columns to the drivers table so the
-- Anderson Trucking Service QuickBase handoff payload can carry real
-- values instead of the empty strings the schema-gap TODO in
-- src/lib/quickbase/client.ts §B5.4 has been sending.
--
-- All three columns are NULLABLE — drivers who completed intake
-- before this migration shipped don't have an address yet, and the
-- IdentityCaptureForm starts asking for it at the /apply step. The
-- Anderson handoff handler skips the push when address is missing
-- (verified in src/lib/quickbase/client.ts), so a legacy NULL
-- doesn't break anything.
--
-- Why we collect at /apply (not at intake): per the anonymous-intake
-- refactor (commit fea359d), drivers reach /matches without giving
-- ANY contact info. They commit at /apply when they pick a specific
-- carrier. Address belongs in the same identity step as name/email/
-- phone — same friction surface, same trigger moment.

ALTER TABLE "drivers"
        ADD COLUMN "address_street" text,
        ADD COLUMN "address_city" text,
        ADD COLUMN "address_state" varchar(2);
