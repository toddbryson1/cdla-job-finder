-- Lifetime-experience qualifying path + polygon hiring areas
--
-- Driven by U.S. Xpress as the first partner carrier with hiring
-- rules that don't fit the v2 schema:
--
--   1. USX accepts drivers via EITHER 3+ months experience in the
--      last 36 months (existing min_experience_months path), OR
--      12+ months experience in the last 120 months — for drivers
--      who took time off. The current single field silently filters
--      out the second group, so we add a parallel Path B.
--
--   2. USX defines hiring areas as polygons (85 in their KML), not
--      circles. A polygon better captures long thin corridors and
--      irregular shapes than a circle around a domicile point.
--
-- Driver-side new fields let the matcher compute experience in the
-- driver's last N months for any N:
--   - total_career_experience_months: total verified months ever
--   - months_since_last_drove: 0 = currently driving
--
-- Why the DO block: this migration runs against both Neon prod
-- (which has PostGIS available) and local Homebrew Postgres (which
-- doesn't have PostGIS for postgresql@16). The lifetime fields are
-- always applied; the polygon column + GIST index + validity CHECK
-- only land where PostGIS is available. The matcher detects PostGIS
-- at runtime and conditionally emits the ST_Contains branch.

------------------------------------------------------------------
-- Lifetime-experience qualifying path (always applied)
------------------------------------------------------------------

ALTER TABLE "carrier_jobs"
        ADD COLUMN "min_experience_months_lifetime" integer,
        ADD COLUMN "min_experience_months_lifetime_window_months" integer;

ALTER TABLE "drivers"
        ADD COLUMN "total_career_experience_months" integer,
        ADD COLUMN "months_since_last_drove" integer;

-- The lifetime window field is for windows STRICTLY LARGER than the
-- 36-month default of min_experience_months. A carrier requiring
-- "12 months in 24 months" should use min_experience_months alone.
ALTER TABLE "carrier_jobs"
        ADD CONSTRAINT "carrier_jobs_lifetime_window_min" CHECK (
                "min_experience_months_lifetime_window_months" IS NULL
                OR "min_experience_months_lifetime" IS NULL
                OR "min_experience_months_lifetime_window_months" >= 36
        );

------------------------------------------------------------------
-- PostGIS + polygon hiring area (prod only when PostGIS available)
------------------------------------------------------------------

DO $$
BEGIN
        IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'postgis') THEN
                CREATE EXTENSION IF NOT EXISTS postgis;

                -- Column + GIST index inside EXECUTE so the geography
                -- type name is parsed at execution time, after PostGIS
                -- is installed.
                EXECUTE 'ALTER TABLE "carrier_jobs"
                                 ADD COLUMN IF NOT EXISTS "hiring_polygon" geography(Polygon, 4326)';

                -- Validity CHECK: refuse self-intersecting, unclosed,
                -- or otherwise broken polygons at INSERT/UPDATE time.
                -- ST_IsValid wants a geometry, not a geography.
                EXECUTE $sql$
                        ALTER TABLE "carrier_jobs"
                                ADD CONSTRAINT "carrier_jobs_hiring_polygon_valid" CHECK (
                                        "hiring_polygon" IS NULL OR ST_IsValid("hiring_polygon"::geometry)
                                )
                $sql$;

                EXECUTE 'CREATE INDEX IF NOT EXISTS "carrier_jobs_hiring_polygon_gix"
                                 ON "carrier_jobs" USING GIST ("hiring_polygon")';

                RAISE NOTICE 'PostGIS available — hiring_polygon column + GIST index created';
        ELSE
                -- Local-dev fallback: add the column as plain text so
                -- Drizzle's declared schema matches what's in the DB
                -- (otherwise INSERTs that emit "default" for
                -- hiring_polygon would fail with "column does not
                -- exist"). The matcher's runtime PostGIS-detection
                -- skips the polygon SQL path on local, so we never
                -- query or write this column meaningfully here.
                ALTER TABLE "carrier_jobs"
                        ADD COLUMN IF NOT EXISTS "hiring_polygon" text;
                RAISE NOTICE 'PostGIS NOT available — hiring_polygon column added as text fallback (local dev; prod has it as geography)';
        END IF;
END $$;
