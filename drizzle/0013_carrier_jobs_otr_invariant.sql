-- OTR invariant CHECK constraint on carrier_jobs.
--
-- Pairs with src/lib/matching/hardFilter.ts: hiring_radius_miles = NULL
-- means "this job hires nationwide / OTR". The matcher only matches
-- such jobs to drivers who explicitly want OTR (have 'otr' in their
-- home_time array). For that contract to hold, the job row itself
-- must list 'otr' as an accepted home time — otherwise we have a
-- corrupt state where a job claims to hire nationwide but doesn't
-- actually accept OTR drivers.
--
-- This CHECK is the belt-and-suspenders complement to the matcher
-- fix in commit ca73e85: any future data source (Swift sync, manual
-- entry, Tenstreet feed) that tries to insert a row violating the
-- invariant fails at the database level instead of silently leaking
-- bad data into the matcher.
--
-- Pre-check passes against current data (verified by the smoke test:
-- "OTR invariant on carrier_jobs — no violations"); adding the
-- constraint without NOT VALID, so it's enforced on existing rows too.

ALTER TABLE "carrier_jobs"
  ADD CONSTRAINT "carrier_jobs_otr_invariant"
  CHECK (
    "hiring_radius_miles" IS NOT NULL
    OR 'otr' = ANY("accepted_home_time_types")
  );
