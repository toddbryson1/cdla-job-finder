-- Every job has a hiring area: drop the "OTR = national / null radius" model.
--
-- OTR is a RUN type (the driver runs over-the-road, nationwide), NOT a hiring
-- scope. A lane out of Gary, IN hires drivers near Gary, not everywhere. The
-- old model treated a NULL hiring_radius_miles as "hires nationwide / OTR",
-- so a Park City (84098) driver matched a Gary, IN Swift OTR lane as a
-- "near me" result. swift-sync.ts now always sets a real radius; this
-- migration backfills the existing bad rows and forbids the null state.

--> statement-breakpoint
-- 1) Backfill: give every null-radius, no-polygon row a real hiring radius.
--    Local lanes (daily home time only) recruit tight (40 mi); regional and
--    OTR lanes pull wider (75 mi). Mirrors swift-sync defaultHiringRadiusMiles().
UPDATE "carrier_jobs"
SET "hiring_radius_miles" = CASE
  WHEN 'daily' = ANY("accepted_home_time_types")
    AND NOT (
      'weekly' = ANY("accepted_home_time_types")
      OR 'biweekly' = ANY("accepted_home_time_types")
      OR 'otr' = ANY("accepted_home_time_types")
    )
  THEN 40
  ELSE 75
END
WHERE "hiring_radius_miles" IS NULL AND "hiring_polygon" IS NULL;

--> statement-breakpoint
-- 2) Enforce it: a job must have a hiring radius OR a polygon. No null-radius
--    "national hiring" escape hatch (replaces carrier_jobs_otr_invariant).
ALTER TABLE "carrier_jobs" DROP CONSTRAINT IF EXISTS "carrier_jobs_otr_invariant";--> statement-breakpoint
ALTER TABLE "carrier_jobs" ADD CONSTRAINT "carrier_jobs_hiring_area_required" CHECK ("hiring_radius_miles" IS NOT NULL OR "hiring_polygon" IS NOT NULL);
