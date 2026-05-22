# Matching Engine Build Session Prompt — CDLA.jobs

**Version:** 2.0
**Purpose:** Self-contained prompt for a Claude Code session to implement the CDLA.jobs matching engine with geospatial matching and application surface awareness.
**Audience:** Claude Code and the human reviewing the build.
**Owner:** Todd Bryson
**Supersedes:** Matching Engine Build Session Prompt v1
**Companion documents (must be in project context for the build session):** Matching Engine Field Schema v2.1, Carrier Jobs Database Schema v2, Prospect Carrier Job Ingestion Spec v1 (for context only), CLAUDE.md

---

## How to use this document

1. Make sure these files exist in the repo's `docs/` folder:
   - `SPEC_matching-engine-field-schema-v2-1.md`
   - `SPEC_carrier-jobs-database-v2.md`
   - `SPEC_prospect-carrier-job-ingestion-v1.md` (for reference; this session doesn't build the ingestion pipeline)
   - `CLAUDE.md` (at repo root)
2. Start a fresh Claude Code session in the repo
3. Paste the prompt below
4. Review Claude Code's plan before approving execution
5. Spot-check tests and the API endpoint after completion

The matching engine v1 prompt is superseded by this v2 prompt. Do not use the v1 prompt for the build.

---

## The prompt

```
I'm building the CDLA.jobs matching engine v2. This is the geospatial version that supersedes the earlier region-enum design. Read the following files in the project before writing any code:

- docs/SPEC_matching-engine-field-schema-v2-1.md (driver intake field contract; geospatial)
- docs/SPEC_carrier-jobs-database-v2.md (carrier jobs data structure; geospatial; application surface)
- docs/SPEC_prospect-carrier-job-ingestion-v1.md (context only; this build doesn't include the ingestion pipeline)
- CLAUDE.md (project guide)
- src/db/schema.ts (current Drizzle schema)
- src/lib/intake-schema.ts (current Zod intake schema)

Then build the matching engine according to the requirements below.

# Goal

Implement a deterministic, geospatial matching engine that takes a driver intake record and returns a ranked list of carrier jobs (up to 20) the driver qualifies for, using location-based filtering plus the existing hard-filter and soft-rank logic.

# Scope of this build session

In scope:
- The matching engine module (`src/lib/matching/`)
- Drizzle schema updates per Carrier Jobs Database Schema v2 §11 migration plan
- A new `zip_codes` table populated from a US zip code dataset
- Migration to add new fields with sensible defaults; restructure existing rule rows to job rows
- Updated seed data with composite partner carriers having real geospatial domiciles
- Unit tests for the matching engine (geospatial + hard-filter + soft-rank + label mapping)
- A simple internal API endpoint that exercises the engine (`/api/match`, POST, takes a driver_id, returns ranked matches)

Out of scope (do not build):
- The driver intake UI changes (separate session)
- Debbie conversational intake (separate session)
- The prospect carrier job ingestion pipeline (separate session)
- The application submission engine (separate session — this build only RETURNS the application surface in match results; it does not submit applications)
- Stage 2 per-carrier qualifying surface (separate session)
- Carrier admin UI
- Candidate email send
- Reverse-match alert send
- Authentication

# Engine architecture

The engine is a TypeScript module exporting a primary function:

    matchDriver(driverId: UUID, options?: MatchOptions): Promise<MatchResult>

Implementation rules:

1. The engine is called in-process by API endpoints. No microservice.
2. Sub-2-second response target with the current dataset size (verify with benchmark test).
3. The engine is time-aware. Tier 1 exclusivity is enforced INSIDE the engine, not at a display layer.
4. The engine reads from `carriers`, `carrier_jobs`, and `zip_codes` tables. It does not write to any tables.
5. The engine is pure-deterministic for a given (driver_id, current_time, database state) tuple.

# Geospatial filtering — the new piece

The geospatial hard filter uses the haversine formula to compute distance between two lat/lng points. Implement in plain SQL inline (no PostGIS).

Haversine distance formula in PostgreSQL/SQL:

    -- distance in miles
    3959 * acos(
      cos(radians(:driver_lat)) * cos(radians(domicile_lat)) *
      cos(radians(domicile_lng) - radians(:driver_lng)) +
      sin(radians(:driver_lat)) * sin(radians(domicile_lat))
    )

The matching SQL should include this expression and filter where:

    -- the job is OTR with no radius (NULL), OR
    -- the driver is within hiring_radius_miles of domicile, OR
    -- the driver is willing to relocate AND the job is OTR-eligible

    (
      hiring_radius_miles IS NULL
      OR
      (3959 * acos(...) ) <= hiring_radius_miles
      OR
      (
        :driver_willing_to_relocate = TRUE
        AND
        'otr' = ANY(accepted_home_time_types)
      )
    )

For efficient indexing without PostGIS, prefilter candidates with a simple lat/lng bounding box before computing exact haversine. This drops most non-matches without the expensive math:

    -- bounding box prefilter (approximate)
    AND domicile_lat BETWEEN :driver_lat - 4 AND :driver_lat + 4
    AND domicile_lng BETWEEN :driver_lng - 4 AND :driver_lng + 4

(Roughly 4 degrees ≈ 275 miles in either direction; covers any plausible radius. Adjust if real radii are larger.)

# Hard-filter logic (Stage 1 fields)

A driver matches a job only if ALL of these are true:

1. Carrier status is `active` AND job status is `active`
2. **GEOSPATIAL: see above**
3. Job's `equipment` is in driver's `desired_equipment` array
4. Driver's `experience_months` (computed from `years_held × 12`) >= job's `min_experience_months`
5. If job's `min_otr_experience_months` is non-null, driver's `otr_years × 12` >= that value
6. If job's `accepted_cdl_states` is non-empty, driver's `cdl_state` is in the array
7. Every endorsement in job's `required_endorsements` is in driver's `endorsements` array
8. Driver's `home_time` is in job's `accepted_home_time_types` array
9. Pay: see "Pay logic" below
10. If driver's `terminated_from_any_of_last_3_employers = true`, job's `accepts_terminated` must be true
11. If driver's `failed_dot_test = true`, job's `accepts_failed_dot_test` must be true
12. SAP: based on driver's `sap_status` and job's `sap_tolerance`:
    - Job `accepts_none`: driver must be `not-in-sap`
    - Job `accepts_completed_only`: driver must be `not-in-sap` or `completed-sap`
    - Job `accepts_all`: any driver SAP status passes

If any hard filter fails, the job does not appear in the driver's match list.

# Pay logic

Three cases:

1. Driver `min_weekly_pay` is 0 or null — all jobs pass the pay filter
2. Driver `min_weekly_pay` > 0, job's `pay_range_max_weekly_usd` non-null — passes if job's max >= driver's floor
3. Driver `min_weekly_pay` > 0, job's `pay_range_max_weekly_usd` IS NULL — passes with `payWarning: 'pay_not_disclosed'` in the match result

This is intentional product behavior: drivers see carriers we can't verify, with a warning. They decide.

# Soft-rank scoring

Among jobs that pass all hard filters, rank by descending composite soft-rank score.

Components:

- **equipment_overlap:** count of equipment types in driver's `equipment_run` that match job's `preferred_equipment_experience` array
- **region_preference:** 1 if any of job's `preferred_regions` is in driver's `desired_regions`, else 0
- **distance_score:** 1 if driver is within 50 miles of domicile, 0.5 if within hiring_radius_miles, 0 otherwise (for OTR-no-radius jobs, distance_score = 0)
- **data_quality_bonus:** `complete` = 1, `partial` = 0.5, `minimal` = 0

Composite formula:

    soft_rank = (equipment_overlap × 2) + region_preference + distance_score + data_quality_bonus

Tiebreaks in order:

1. Tier 1 before Tier 2 (within their respective exclusivity windows)
2. carrier.kind ordering: `partner` before `subscription` before `prospect`
3. Most recent `last_verified_at` first
4. Stable: job UUID descending

# Tier 1 exclusivity logic

The engine enforces a 24-hour exclusivity window on Tier 1 carriers.

For each carrier with `tier = tier_1` AND `tier_1_billing_status = current`:

- Look up the first-match time for this (driver, carrier) pair via stub function `getFirstMatchTime(driverId, carrierId)`
- If current_time is within 24 hours of that first-match time, this Tier 1 job is included AND all non-Tier-1 jobs for the same (equipment, domicile region) are EXCLUDED for this driver during the window
- After 24 hours, all matching jobs appear normally (Tier 1 still gets soft-rank priority via the carrier.kind tiebreak)

Stub `getFirstMatchTime` in this build returns NULL (no history table yet). Treat NULL as "first match is right now" — so a brand-new match is in its exclusivity window. A future build session implements the `driver_carrier_matches` table and replaces the stub.

# Stage 2 fields

Stage 2 fields (tickets, accidents, DUI, felony) are NOT used in this engine's Stage 1 matching. They're checked after the driver clicks into a specific carrier match via a separate function:

    qualifyDriverForCarrier(driverId, jobId, stage2Data): Promise<QualificationResult>

Stub this function but don't implement the full logic in this build session. The function signature must be correct so it can be filled in later.

# Match result shape

```typescript
type MatchResult = {
  driverId: UUID;
  matchedAt: Date;
  matches: Match[];
  truncated: boolean;
};

type Match = {
  jobId: UUID;
  carrierId: UUID;
  carrierName: string;
  carrierKind: 'partner' | 'prospect' | 'subscription';
  carrierTier: 'tier_1' | 'tier_2' | 'none';
  label: 'Sponsored Match' | 'Referral Partner' | 'Public Job Posting' | null;
  positionTitle: string;
  equipment: Equipment;
  domicileCity: string;
  domicileState: string;
  distanceMilesFromDriverHome: number | null;  // null for OTR-anywhere jobs
  payRangeMinWeekly: number | null;
  payRangeMaxWeekly: number | null;
  payWarning: 'pay_not_disclosed' | null;
  applicationSurface: 'tenstreet_intelliapp' | 'custom_intake_form' | 'email_only' | 'phone_only' | 'unknown';
  applicationUrl: string | null;
  applicationPhone: string | null;
  softRankScore: number;
  exclusivityWindowEndsAt: Date | null;
  verificationStatus: 'verified' | 'stale' | 'unverified';
  dataQuality: 'complete' | 'partial' | 'minimal';
};
```

Label mapping:
- `carrierTier === 'tier_1'` → `'Sponsored Match'`
- `carrierKind === 'partner'` AND NOT `tier_1` → `'Referral Partner'`
- `carrierKind === 'prospect'` AND NOT `tier_1` → `'Public Job Posting'`
- `carrierKind === 'subscription'` AND `tier === 'none'` → `null`

If both partner AND tier_1: `'Sponsored Match'` takes precedence.

Match list cap: 20. If more than 20 jobs pass hard filters, return top 20 by soft-rank with `truncated: true`.

# API endpoint

Build `src/app/api/match/route.ts` with a POST endpoint:

- Accepts JSON: `{ "driverId": "uuid" }`
- Validates the driver exists; if `home_zip` is set but `home_lat`/`home_lng` are not, geocodes from zip_codes table and persists
- Calls `matchDriver(driverId)` with current time
- Returns the MatchResult as JSON
- Returns 404 if driver doesn't exist, 422 if driver has no valid home_zip, 500 with logged error on engine failure

Internal endpoint. No auth in this session.

# Drizzle schema and migration

Update `src/db/schema.ts` per Carrier Jobs Database Schema v2 §11 migration plan. Key changes:

1. **Rename or replace `carrier_hiring_rules` → `carrier_jobs`**, adding:
   - Geospatial: `domicile_city`, `domicile_state`, `domicile_zip`, `domicile_lat`, `domicile_lng`, `hiring_radius_miles`
   - Application surface: `application_surface`, `application_url`, `application_email`, `application_phone`, `application_form_schema` (jsonb), `last_application_surface_verified_at`
   - Data provenance: `data_source`, `source_url`, `last_verified_at`, `verification_status`, `data_quality`
   - Soft-rank: `preferred_equipment_experience`, `preferred_regions`
   - Stage 2 (same as v1 carrier rules): `max_tickets_3yr`, `max_accidents_3yr`, `max_at_fault_accidents_3yr`, `accepts_dui`, `dui_max_recency_months`, `accepts_felony`
   - Existing hard-filter fields (carry over from carrier_hiring_rules)

2. **Add fields to `carriers` table:**
   - Subscription state: `tier_1_started_at`, `tier_1_renewed_at`, `tier_1_billing_status`
   - PHTP partner state: `phtp_referral_agreement_active`, `phtp_referral_agreement_signed_at`, `phtp_per_hire_bounty_usd`
   - Business address geo: `business_address_lat`, `business_address_lng`
   - General: `fmcsa_mc_number`, `fmcsa_dot_number`, `tenstreet_account_id`, `public_careers_url`

3. **Add fields to `drivers` table:**
   - `home_lat`, `home_lng` (decimal, nullable; populated from `home_zip` lookup)
   - `willing_to_relocate` (boolean, default false)

4. **Create new `zip_codes` table:**
   - `zip` (string, PK), `city`, `state`, `lat`, `lng` (decimals)
   - Populate from a US zip code dataset (the seed includes one — use a public CSV from a reputable source; suggested: SimpleMaps US Cities Free dataset, or similar; document the source)

# Backfill defaults

For existing rule rows being migrated to job rows:

- Domicile: derive from carrier's primary city/state if available; geocode via zip_codes table; if no specific location is known, use carrier's FMCSA business address; if neither, mark `data_quality = minimal` and skip the row from matching (or set placeholder lat/lng with verification_status = unverified)
- `hiring_radius_miles`: based on the old region enum:
  - `local`, `regional`: 75 miles
  - `otr`: NULL (no radius)
  - Other coarse regions: 200 miles, flagged for refresh
- `application_surface`: `tenstreet_intelliapp` for known partner carriers; `unknown` for prospects until ingestion classifies
- Other defaults same as v1: `accepts_terminated = false`, `accepts_failed_dot_test = false`, `sap_tolerance = 'accepts_none'`, etc.

# Updated seed data

Update `npm run db:seed` to include carriers with REAL geospatial domiciles (composite/fictional carriers — don't use real carrier names you don't have permission to publish):

1. Three `kind = partner` carriers:
   - Atlanta-area reefer carrier (domicile: Atlanta, GA, 33.749/-84.388, hiring radius 75 miles, application_surface: tenstreet_intelliapp)
   - Midwest dry van carrier (domicile: Indianapolis, IN, 39.768/-86.158, hiring radius 100 miles, application_surface: tenstreet_intelliapp)
   - Texas flatbed carrier (domicile: Dallas, TX, 32.776/-96.797, hiring radius 150 miles, application_surface: tenstreet_intelliapp)

2. One `kind = subscription, tier = tier_1` carrier:
   - Southeast multi-equipment (multiple jobs: Atlanta GA reefer, Charlotte NC dry van, Jacksonville FL flatbed; varying radii 75-100 miles; application_surface: custom_intake_form with example schema)

3. One `kind = subscription, tier = tier_2` carrier:
   - Florida regional (domicile: Orlando, FL, hiring radius 150 miles, application_surface: tenstreet_intelliapp)

4. One `kind = prospect` carrier:
   - Scraped-style sparse data: only domicile city/state, application_surface: 'unknown', data_quality: minimal, FMCSA business address only

Each carrier may have 1-3 job rows with varied criteria. The variety lets matching engine tests exercise the full filter and rank logic.

# Unit tests

Write tests in `src/lib/matching/__tests__/matchDriver.test.ts` covering:

1. Empty match list — driver in a region with no matching jobs (e.g., driver in Hawaii, no jobs in HI)
2. Single match — driver in Atlanta matching the Atlanta reefer carrier
3. Geospatial filter — driver in Aurora CO (39.729/-104.832) matching jobs in Denver (within radius) but not Dallas (out of radius)
4. Geospatial filter — OTR job with NULL hiring_radius_miles matches a driver from any location
5. willing_to_relocate — driver in Aurora willing to relocate sees OTR jobs in Texas as matches
6. willing_to_relocate = false — same driver does NOT see OTR jobs in Texas as matches (unless they're OTR-no-radius)
7. Equipment hard filter — driver wants dry van; jobs not in dry van don't appear
8. Endorsement hard filter — driver lacks hazmat; jobs requiring hazmat excluded
9. Experience hard filter — driver has 1 year; job requiring 24 months excluded
10. Pay floor — driver $1000/wk floor, job pays max $900/wk → excluded; job pays max $1100/wk → included
11. Pay floor — driver $1000/wk floor, job pay is NULL → included with pay_warning flag
12. SAP tolerance — three test cases, one per enum value (accepts_none, accepts_completed_only, accepts_all)
13. Tier 1 exclusivity — driver matches Tier 1 carrier and would also match Tier 2; Tier 2 excluded during window
14. Tier 1 expired window — driver matches Tier 1 carrier whose first-match was 25 hours ago; both Tier 1 and Tier 2 appear
15. Label mapping — partner without tier_1 → 'Referral Partner'; tier_1 carrier → 'Sponsored Match'; subscription tier_2 → null; prospect → 'Public Job Posting'
16. Match cap at 20 — driver with permissive profile matching 25 jobs; returns 20 with `truncated: true`
17. Application surface returned — match result includes `applicationSurface`, `applicationUrl` (or null), `applicationPhone` (or null)
18. Soft-rank ordering — driver with equipment_run matching job's preferred_equipment_experience ranks higher than driver without match
19. Data quality affects ranking — complete jobs rank higher than partial which rank higher than minimal, all else equal
20. Distance score — driver within 50 miles ranks above driver within hiring_radius but outside 50 miles

Run tests with `npm test`. All tests must pass before this session is considered complete.

# Benchmark test

Add a benchmark test that runs `matchDriver` against the seeded dataset 100 times and asserts median is under 300ms. Sub-2-second is the production target; 300ms in dev gives headroom for production traffic + bounding box prefilter optimization.

# What to do, in order

1. Read all referenced files
2. Plan the build (output the plan, wait for human approval before writing code)
3. Update `src/db/schema.ts` with new fields and table structure
4. Generate and apply the migration
5. Create and populate the `zip_codes` table
6. Update seed data
7. Implement the matching engine module
8. Implement the API endpoint
9. Write unit tests
10. Run all tests and benchmarks
11. Report results, flag any issues encountered

If anything is ambiguous, ASK before guessing.

# Things to be careful about

- The bounding box prefilter is an optimization, NOT a correctness mechanism. The haversine calculation is the actual filter. The bounding box just reduces the candidates checked.
- Geocoding via zip_codes is a left join, not an inner join — drivers without a valid home_zip should be flagged but not crash the engine
- The application surface schema (jsonb) is opaque to the matching engine. The engine just returns it; submission logic happens elsewhere.
- Don't include archived or paused carriers/jobs regardless of any other filter
- Endorsement check is "all required must be present" — not "any" or "majority"
- The Tier 1 exclusivity stub returns NULL in this build; make sure the function signature and call site allow drop-in replacement later
- The geospatial filter is applied at the SQL layer for performance, not in application code after fetching all jobs
- Driver willing_to_relocate = true does not bypass equipment, experience, or other hard filters — it only relaxes the geospatial constraint for OTR-eligible jobs

# Output format

When done:
- Summarize what was built
- List each file created or modified
- Report test results (passing count, any failures)
- Report benchmark result (median ms)
- List any decisions made that weren't fully specified
- List any questions or follow-ups for the human

Then stop. Don't proceed to next-session work.
```

---

## What this build session does NOT build

For future sessions:

- `driver_carrier_matches` table for match-event tracking (replaces Tier 1 exclusivity stub)
- Stage 2 qualifying logic (`qualifyDriverForCarrier` function body)
- Match display UI (`/matches` page)
- Per-carrier card UI
- The prospect carrier job ingestion pipeline
- The application submission engine (Type 1 form submission, email-based submission, etc.)
- Candidate email send wiring
- Reverse-match alert wiring
- Driver intake form restructure
- Debbie conversational intake
- Authentication

---

## After the session — what to verify as a human

1. **Spot-check the tests.** Look at 3-4 test cases (especially the geospatial ones — tests 3, 4, 5, 6) and verify they test what the spec says.

2. **Manually exercise the API endpoint.** POST to `/api/match` with a driver_id from the seed data. Verify the response structure matches the spec.

3. **Test the geospatial filter manually.** Pick two seeded drivers in different cities — one should match local jobs only, one with willing_to_relocate should see broader matches.

4. **Check the migration applied.** Open Drizzle Studio (`npm run db:studio`), verify new fields exist on `carriers`, `carrier_jobs`, `drivers`, and the new `zip_codes` table is populated.

5. **Read Claude Code's "decisions I made" output.** Especially watch for any architectural drift around the geospatial implementation or application surface handling.

6. **Run the benchmark.** Verify median under 300ms with the seeded dataset.

---

## Open questions this prompt does not resolve

These need human decisions either before or during the build session:

1. **Source of the zip code dataset.** SimpleMaps Free US Cities, or similar reputable source. Should be checked into the repo as a CSV import in the migration. License terms matter.

2. **Whether to seed all 42K US zip codes**, or a smaller subset (e.g., zip codes within 50 miles of seeded carrier domiciles) for faster dev startup. Full dataset is more realistic but slower to seed. Tradeoff: dev experience vs. realism.

3. **Bounding box prefilter degree size.** 4 degrees ≈ 275 miles in either direction works for typical hiring radii up to ~200 miles. If real radii grow larger (e.g., 500 miles), the bounding box needs adjustment.

4. **Whether `home_lat/home_lng` should be required at intake.** Currently they're computed from `home_zip` at intake-completion time. If the driver completes intake without a valid zip, the matching engine can't match them. The API endpoint should return 422 in that case (already specced) but the intake UI also needs to handle this.

5. **Default for prospect carriers' `application_surface`** until the ingestion pipeline classifies them. Currently `unknown`. Some carriers may be filtered out of matching entirely until classified; others may match but show a generic "Apply directly" link.

---

## Change log

| Date | Change | By |
|------|--------|-----|
| 2026-05-21 | v1 created — region enum design | Todd + Claude |
| 2026-05-21 | v2 created — geospatial model, application surface awareness, replaces v1 | Todd + Claude |

---

*End of document.*
