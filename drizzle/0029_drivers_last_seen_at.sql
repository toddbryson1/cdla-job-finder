-- Track when each driver last loaded /me so we can show
-- "X new matches since your last visit" on the dashboard.
--
-- last_seen_at is updated by /api/me/touched (called from the /me
-- page's client-side beacon AFTER render), so a single page load
-- doesn't overwrite the value we used to render the page. The
-- comparison is "deltas since the value READ at render time."
--
-- previous_seen_at retains the second-most-recent value so the
-- dashboard can show "since {date}" wording instead of just "new"
-- which would be ambiguous on a fresh session.
--
-- Both NULL for the legacy population — driver was created before
-- this column existed and has never re-visited /me. The dashboard
-- treats null as "no prior visit" and skips the delta badges.

ALTER TABLE "drivers"
        ADD COLUMN "last_seen_at" timestamp with time zone,
        ADD COLUMN "previous_seen_at" timestamp with time zone;
