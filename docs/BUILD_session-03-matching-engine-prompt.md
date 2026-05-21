# Matching Engine Build Session Prompt — CDLA.jobs

**Version:** 1.0
**Purpose:** Self-contained prompt for a Claude Code session to implement the CDLA.jobs matching engine.
**Audience:** Claude Code (the LLM doing the build) and the human reviewing the build.
**Owner:** Todd Bryson
**Companion documents (must be in project context for the build session):** Matching Engine Field Schema v2, Carrier Rules Database Schema v1, CLAUDE.md

---

## How to use this document

1. Make sure these files exist in the project: `SPEC_matching-engine-field-schema-v2.md`, `SPEC_carrier-rules-database-v1.md`, `CLAUDE.md`
2. Start a Claude Code session in the `cdla-job-finder` repo
3. Paste this prompt into the session
4. Review Claude Code's plan before approving execution
5. Spot-check the test cases after build completion

The prompt is structured so Claude Code has everything it needs: the spec references, the implementation requirements, the test expectations, and the scope boundaries.

---

## The prompt

```
I'm building the CDLA.jobs matching engine. Read the following files in the project before writing any code:

- SPEC_matching-engine-field-schema-v2.md (the driver intake field contract)
- SPEC_carrier-rules-database-v1.md (the carrier rules data structure)
- CLAUDE.md (the project guide)
- src/db/schema.ts (current Drizzle schema)
- src/lib/intake-schema.ts (current Zod intake schema)

Then build the matching engine according to the requirements below.

# Goal

Implement a deterministic, rule-based matching engine that takes a driver intake record and returns a ranked list of carrier hiring rules (up to 20) the driver qualifies for, applying hard filters and soft-rank scoring per the specs.

# Scope of this build session

In scope:
- The matching engine module (`src/lib/matching/`)
- Drizzle schema updates for new fields per SPEC_carrier-rules-database-v1.md §9
- Migration to add the new fields with sensible defaults
- Updated seed data with composite test carriers
- Unit tests for the matching engine
- A simple internal API endpoint that exercises the engine (`/api/match`, POST, takes a driver_id, returns ranked matches)

Out of scope (do not build):
- The driver intake UI changes (form fallback restructure is a separate session)
- Debbie conversational intake (separate session)
- Stage 2 per-carrier qualifying surface (separate session)
- Carrier admin UI
- Candidate email send
- Reverse-match alert send
- Authentication

# Engine architecture

The engine is a TypeScript module exporting a single primary function:

    matchDriver(driverId: UUID, options?: MatchOptions): Promise<MatchResult>

Implementation rules:

1. The engine is called in-process by API endpoints. No microservice, no separate runtime.
2. Sub-2-second response target with the current dataset size (verify with a benchmark test).
3. The engine is time-aware. Tier 1 exclusivity is enforced INSIDE the engine, not at a display layer. The engine consults the current time to determine which Tier 1 carrier rules are still within their exclusivity window for this driver.
4. The engine reads from `carriers` and `carrier_hiring_rules` tables. It does not write to any tables. (Write side — match event logging — is out of scope for this session.)
5. The engine is pure-deterministic for a given (driver_id, current_time, database state) tuple. Two calls with the same inputs return the same output.

# Hard-filter logic (Stage 1 fields)

A driver matches a carrier hiring rule only if ALL of these are true:

1. Carrier status is `active` AND rule status is `active`
2. Rule's equipment is in driver's `desired_equipment` array
3. Rule's region is in driver's `desired_regions` array (or driver has `any` in their regions)
4. Driver's `experience_months` (computed from `years_held`) >= rule's `min_experience_months`
5. If rule's `min_otr_experience_months` is non-null, driver's `otr_years` converted to months >= that value
6. If rule's `accepted_cdl_states` is non-empty, driver's `cdl_state` is in the array (empty array means all states accepted)
7. Every endorsement in rule's `required_endorsements` is in driver's `endorsements` array
8. Driver's `home_time` is in rule's `accepted_home_time_types` array
9. Pay: see §"Pay logic" below
10. If driver's `terminated_from_any_of_last_3_employers` is true, rule's `accepts_terminated` must be true
11. If driver's `failed_dot_test` is true, rule's `accepts_failed_dot_test` must be true
12. SAP: based on driver's `sap_status` and rule's `sap_tolerance`:
    - Rule `accepts_none`: driver must be `not-in-sap`
    - Rule `accepts_completed_only`: driver must be `not-in-sap` or `completed-sap`
    - Rule `accepts_all`: any driver SAP status passes

If any hard filter fails, the rule does not appear in the driver's match list.

# Stage 2 fields

This engine session matches on Stage 1 fields only. Stage 2 fields (`tickets_3yr_count`, `accidents_3yr_count`, `accidents_3yr_at_fault_count`, `dui_ever`, `dui_most_recent_date`, `felony_ever`) are collected after the driver clicks into a specific carrier match. A separate function (`qualifyDriverForCarrier`) handles Stage 2 filtering against a single carrier rule; build a stub for it but don't implement the full logic in this session.

Stub signature:

    qualifyDriverForCarrier(driverId: UUID, ruleId: UUID, stage2Data: Stage2Data): Promise<QualificationResult>

The full Stage 2 implementation lives in a future build session.

# Pay logic (specific guidance per attached spec decisions)

Three cases:

1. Driver `min_weekly_pay` is 0 or null (no floor specified):
   - All carriers match on pay (hard filter passes regardless of rule's pay range)

2. Driver `min_weekly_pay` > 0, and rule's `pay_range_max_weekly_usd` is non-null:
   - Hard filter passes if rule's max >= driver's floor
   - Hard filter fails if rule's max < driver's floor

3. Driver `min_weekly_pay` > 0, and rule's `pay_range_max_weekly_usd` IS null:
   - Hard filter passes (carrier appears in match list)
   - The match result must include a `pay_warning: "pay_not_disclosed"` flag for this match
   - Downstream UI is responsible for displaying the warning to the driver

This is a deliberate product decision: drivers with pay floors see carriers whose pay we can't verify, with a warning. They decide whether to pursue.

# Tier 1 exclusivity logic

The engine enforces a 24-hour exclusivity window on Tier 1 carriers.

For each carrier with `tier = tier_1` AND `tier_1_billing_status = current`:

- The engine looks up (or creates a stub for looking up) the time at which this driver was first matched to this Tier 1 carrier
- If the current time is within 24 hours of that first-match time, this Tier 1 rule is included in the driver's match list AND ALL non-Tier-1 rules for the same (equipment, region) combination are EXCLUDED for this driver during the window
- After 24 hours, all matching rules appear normally (Tier 1 just gets soft-rank priority)

This means: a driver in Atlanta looking for reefer who matches a Tier 1 carrier in that lane sees ONLY the Tier 1 carrier for 24 hours, even if 4 other Tier 2 carriers also match that lane. After 24 hours, all 5 appear.

Match-event tracking is out of scope for this session. Stub the lookup with a function `getFirstMatchTime(driverId: UUID, carrierId: UUID): Promise<Date | null>` that returns null in this build (no history table yet). When the stub returns null, treat the first-match-time as the current request time (so a brand-new match is in its exclusivity window).

A future build session will implement the `driver_carrier_matches` table and replace the stub with real lookups.

# Soft-rank scoring

Among rules that pass all hard filters, rank by descending soft-rank score.

Soft-rank score for a (driver, rule) pair = count of equipment types in driver's `equipment_run` that match rule's `preferred_equipment_experience` array.

Simple intersection count. No weighting in v1.

Ties broken by:
1. Tier 1 before Tier 2 (within their respective time windows — see exclusivity logic above)
2. PHTP partner before subscription before prospect (`carriers.kind` ordering)
3. Most recent `last_verified_at` first
4. Stable tiebreak: rule UUID descending (arbitrary but deterministic)

# Match result shape

The engine returns:

    type MatchResult = {
      driverId: UUID;
      matchedAt: Date;
      matches: Match[];
      truncated: boolean;  // true if there were more than 20 hard-filter passes
    };

    type Match = {
      ruleId: UUID;
      carrierId: UUID;
      carrierName: string;
      carrierKind: 'partner' | 'prospect' | 'subscription';
      carrierTier: 'tier_1' | 'tier_2' | 'none';
      label: 'Sponsored Match' | 'Referral Partner' | null;
      // Label mapping:
      //   tier === 'tier_1' → 'Sponsored Match'
      //   kind === 'partner' → 'Referral Partner'
      //   both true → 'Sponsored Match' (tier takes precedence)
      //   neither → null
      equipment: Equipment;
      region: Region;
      positionTitle: string;
      payRangeMinWeekly: number | null;
      payRangeMaxWeekly: number | null;
      payWarning: 'pay_not_disclosed' | null;
      softRankScore: number;
      exclusivityWindowEndsAt: Date | null;  // non-null only for Tier 1 rules still in window
      verificationStatus: 'verified' | 'stale' | 'unverified';
    };

Match list is capped at 20. If more than 20 rules pass hard filters, return the top 20 by soft-rank with `truncated: true`.

# API endpoint

Build `src/app/api/match/route.ts` with a POST endpoint:

- Accepts JSON: `{ "driverId": "uuid" }`
- Validates the driver exists
- Calls `matchDriver(driverId)`
- Returns the MatchResult as JSON
- Returns 404 if driver doesn't exist, 500 with logged error on engine failure

This is an internal endpoint for testing. No auth on this endpoint in this session (we'll add auth later).

# Drizzle schema and migration

Update `src/db/schema.ts` to add the fields specified in SPEC_carrier-rules-database-v1.md §9 migration list. Then run `npm run db:generate` to create the migration, and verify it applies cleanly with `npm run db:migrate`.

For existing rows in `carrier_hiring_rules` (the seeded composite example carriers), backfill new fields with these defaults:

- `min_otr_experience_months`: null (no OTR requirement)
- `accepted_cdl_states`: empty array (all states)
- `required_endorsements`: empty array
- `accepted_home_time_types`: ['weekly', 'biweekly', 'otr'] (most common combination; verify against seeded carrier intent)
- `accepts_terminated`: false (conservative)
- `accepts_failed_dot_test`: false (conservative)
- `sap_tolerance`: 'accepts_none' (conservative)
- `max_tickets_3yr`: 3 (industry-typical)
- `max_accidents_3yr`: 1 (industry-typical)
- `max_at_fault_accidents_3yr`: 0 (industry-typical)
- `accepts_dui`: false (conservative)
- `dui_max_recency_months`: null
- `accepts_felony`: false (conservative)
- `preferred_equipment_experience`: same as the rule's `equipment` field (single-element array)
- `rule_source`: 'manual_partner_intake'
- `last_verified_at`: now
- `verification_status`: 'verified'

For the `carriers` table backfills:

- `kind`: existing seeded carriers were `partner` per CLAUDE.md; keep as is
- `tier`: 'none' for existing partners; flag any that should be `tier_1` or `tier_2` for manual review
- `status`: 'active'
- `tier_1_started_at`, `tier_1_renewed_at`: null
- `tier_1_billing_status`: null
- `phtp_referral_agreement_active`: true for `kind = partner`
- `tenstreet_account_id`: null (to be filled in via admin tooling later)

# Updated seed data

Update `npm run db:seed` to include:

1. Three `kind = partner` carriers (Atlanta-area reefer, Midwest dry van, Texas flatbed)
2. One `kind = subscription, tier = tier_1` carrier (Southeast multi-equipment)
3. One `kind = subscription, tier = tier_2` carrier (Florida regional)
4. One `kind = prospect` carrier (scraped-style entry, sparse fields)

Each carrier should have 1-3 hiring rules with varied criteria (different equipment, regions, pay ranges, endorsement requirements). The variety lets the matching engine tests exercise the full filter and rank logic.

# Unit tests

Write tests in `src/lib/matching/__tests__/matchDriver.test.ts` covering:

1. Empty match list — driver in a region with no matching carriers
2. Single hard-filter pass — straightforward match against one rule
3. Multiple hard-filter passes ordered by soft-rank — driver with rich equipment_run, multiple matches, verify ranking
4. Hard-filter fail on each individual field (one test per field) — driver in just-disqualifying state, verify carrier excluded
5. Pay floor with disclosed pay max — driver floor below max passes, above max fails
6. Pay floor with undisclosed pay (null max) — match passes with `pay_warning: 'pay_not_disclosed'`
7. SAP tolerance — three test cases, one per tolerance enum value
8. Tier 1 exclusivity — driver matches a Tier 1 carrier and would also match a Tier 2; Tier 2 is excluded during window
9. Tier 1 expired window — driver matches Tier 1 carrier whose first-match was 25+ hours ago; both Tier 1 and Tier 2 appear
10. Label mapping — partner without tier → 'Referral Partner'; tier_1 carrier (any kind) → 'Sponsored Match'; subscription without tier → null
11. Cap at 20 — driver with permissive profile matching 25 rules; returns 20 with `truncated: true`
12. Empty equipment_run — driver has not run any equipment in any rule's preferred_equipment_experience; soft-rank ties at 0, ranks fall back to deterministic tiebreaks

Run tests with `npm test`. All tests must pass before this session is considered complete.

# Benchmark test

Add a benchmark test that runs `matchDriver` against the seeded dataset 100 times and asserts the median is under 200ms. Sub-2-second is the spec target; aiming at 200ms in dev gives us headroom.

# What to do, in order

1. Read all referenced files
2. Plan the build (output the plan, wait for human approval before writing code)
3. Update `src/db/schema.ts` with new fields
4. Generate and apply the migration
5. Update seed data
6. Implement the matching engine module
7. Implement the API endpoint
8. Write the unit tests
9. Run all tests and benchmarks
10. Report results, flag any issues encountered

If anything in the specs or this prompt is ambiguous, ASK before guessing. Don't make architectural decisions silently.

# Things to be careful about

- Don't auto-convert `years_held` to `experience_months` in a way that drops fractional years. A driver with 1.5 years should be treated as 18 months, not 12.
- The Tier 1 exclusivity stub returns null in this build because match history doesn't exist yet. Make sure the function signature and call site are correct so the future implementation can drop in cleanly.
- Endorsements check is "all required endorsements must be in driver's set" — not "any" or "majority." A carrier requiring hazmat AND tanker only matches drivers with both.
- The `preferred_equipment_experience` array can include equipment types the rule doesn't itself hire for — a flatbed rule might prefer drivers who have run flatbed and oversized.
- Don't include archived or paused carriers/rules in matching results regardless of any other filter.
- Be careful with `desired_regions` containing the special value `any` — that bypasses the region hard filter entirely.

# Output format

When you're done:
- Summarize what was built
- List each file created or modified
- Report test results (passing count, any failures)
- Report benchmark result (median ms)
- List any decisions you made that weren't fully specified in the inputs
- List any questions or follow-ups for the human

Then stop. Don't proceed to next-session work; let the human review and decide what's next.
```

---

## What this build session does NOT build

For future sessions, not this one:

- `driver_carrier_matches` table for match-event tracking (replaces the Tier 1 exclusivity stub)
- Stage 2 qualifying logic (`qualifyDriverForCarrier` function body)
- Match display UI (the `/matches` page)
- Per-carrier card UI
- The candidate email send wiring
- The reverse-match alert wiring
- Driver intake form restructure to two-stage
- Debbie conversational intake
- Authentication

Each of those is its own build session prompt, written after this one ships and stabilizes.

---

## After the session — what to verify as a human

Before considering this build complete:

1. **Spot-check the tests.** Look at 2-3 test cases and verify they're testing what the spec says they should test. Build sessions sometimes pass tests because the test was wrong, not because the logic was right.

2. **Manually exercise the API endpoint.** POST to `/api/match` with a driver_id from the seed data. Verify the response structure matches the spec's MatchResult shape.

3. **Check the migration applied cleanly.** Run `npm run db:studio`, verify the new fields exist on both tables, verify backfilled rows have sensible values.

4. **Read the build session's output summary.** Look for "decisions I made that weren't fully specified" — that's where build sessions go off-script, and you want to catch any architectural drift before it compounds.

5. **Run the benchmark.** Verify median is comfortably under 200ms with the seeded dataset. If it's slow now, it'll be slower with real data.

If any of these spot-checks fail or the build's output flags issues, fix in a follow-up session before moving to the next piece (Stage 2, match display, etc.).

---

## Open questions this prompt does not resolve

These need human decisions either before or during the build session:

1. **What carriers should be in the new seed data?** The prompt specifies the kinds and tiers, not the specific identities. Use composite/fictional carriers; don't seed real carrier names you don't have permission to publish.

2. **Whether the API endpoint should be authenticated.** The prompt says no auth in this session. Confirm that's acceptable for testing (it is, since `/api/match` is internal and unlinked from the public UI), and plan to add auth in a future session.

3. **Whether `years_held` to `experience_months` conversion rounds, floors, or treats fractional years specially.** I told the prompt "1.5 years = 18 months" implying simple multiplication. If you want different behavior (round down for safety, round up for benefit-of-the-doubt), tell the build session up front.

4. **Whether the benchmark target of 200ms median is the right number.** I picked it as a conservative pre-real-data target. The real measure is the production target of <2 seconds end-to-end including network and rendering.

---

## Change log

| Date | Change | By |
|------|--------|-----|
| 2026-05-21 | v1 created — first matching engine build session prompt | Todd + Claude |

---

*End of document.*
