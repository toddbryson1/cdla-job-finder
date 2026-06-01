-- Relax the OTR invariant CHECK to accept polygon-bounded jobs.
--
-- Old constraint (migration 0013):
--   hiring_radius_miles IS NOT NULL OR 'otr' = ANY(accepted_home_time_types)
--
-- The original intent: when hiring_radius_miles=NULL the job is OTR
-- (hires nationwide), so accepted_home_time_types must include 'otr'
-- — otherwise the matcher would treat a weekly-home-time job as
-- nationwide OTR which is the bug we fixed in commit ca73e85.
--
-- That invariant is correct for the legacy circle-only model. But
-- USX (and any future polygon-using carrier) sets
-- hiring_radius_miles=NULL because hiring_polygon defines the
-- accepted area instead. Those rows have specific home-time types
-- (weekly/daily) and are NOT nationwide OTR — they should pass.
--
-- New constraint: relax to "radius set OR polygon set OR OTR".
-- The polygon path inherits the matcher correctness via ST_Contains
-- (locked to a specific shape, can't accidentally match anywhere).

ALTER TABLE "carrier_jobs"
        DROP CONSTRAINT IF EXISTS "carrier_jobs_otr_invariant";

DO $$
BEGIN
        IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'postgis') THEN
                EXECUTE $sql$
                        ALTER TABLE "carrier_jobs"
                                ADD CONSTRAINT "carrier_jobs_otr_invariant" CHECK (
                                        "hiring_radius_miles" IS NOT NULL
                                        OR "hiring_polygon" IS NOT NULL
                                        OR 'otr' = ANY("accepted_home_time_types")
                                )
                $sql$;
        ELSE
                -- Local dev without PostGIS: hiring_polygon column
                -- exists as text fallback (per migration 0021).
                ALTER TABLE "carrier_jobs"
                        ADD CONSTRAINT "carrier_jobs_otr_invariant" CHECK (
                                "hiring_radius_miles" IS NOT NULL
                                OR "hiring_polygon" IS NOT NULL
                                OR 'otr' = ANY("accepted_home_time_types")
                        );
        END IF;
END $$;
