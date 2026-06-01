-- Relax drivers' contact-info NOT NULL constraints so intake can
-- run anonymously and contact info gets collected at apply time
-- instead of at intake time.
--
-- Rationale: requiring name/email/phone at the very first step of
-- intake forces every browse-curious driver to commit before seeing
-- any matches. Standard modern job-board UX is "search first,
-- identify only when you find something worth pursuing." This
-- migration enables that flow on the data layer; the form,
-- intake API, /matches page, and /apply page changes follow in
-- separate commits.
--
-- After this migration:
--   - new driver rows can be created with NULL first_name, last_name,
--     email, phone (the anonymous intake phase)
--   - existing email-keyed drivers stay identical (no data change)
--   - the /apply page is responsible for filling these in before
--     the driver consents to share info with a specific carrier
--
-- Email is still UNIQUE when set (the existing partial unique index
-- naturally handles NULLs by ignoring them).

ALTER TABLE "drivers"
        ALTER COLUMN "first_name" DROP NOT NULL,
        ALTER COLUMN "last_name" DROP NOT NULL,
        ALTER COLUMN "email" DROP NOT NULL,
        ALTER COLUMN "phone" DROP NOT NULL;
