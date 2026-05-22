# Matching Engine Field Schema — CDLA.jobs

**Version:** 2.1
**Status:** Locked
**Audience:** Engineering, product
**Owner:** Todd Bryson
**Companion documents:** Carrier Jobs Database Schema v2, Matching Engine Build Session Prompt v2, Conversational AI Intake Spec v1, Driver Intake Form (Fallback) Spec v1
**Supersedes:** Matching Engine Field Schema v2

---

## 1. Purpose and what changed from v2

This document specifies the **driver-side contract** for the matching engine — what fields the intake captures, what shape they have, what they mean, and how they flow to the matching backend.

The changes from v2:

- **Driver home location:** the matching engine is now geospatial. The driver's `home_zip` is the primary geographic anchor. The platform geocodes it to lat/long via the `zip_codes` lookup table at intake time.
- **`willing_to_relocate` field added** — a boolean that expands match eligibility for OTR-style jobs outside the driver's hiring radius.
- **`desired_regions` semantics changed** — was a hard filter in v2; demoted to a soft preference in v2.1. The geospatial location filter replaces region as the primary geographic match criterion.
- All other fields (equipment, endorsements, pay, safety) carry over unchanged.

What did not change:
- The View A consent architecture (name/email/phone captured at Stage 1, three discrete consents)
- The Stage 1 / Stage 2 progressive disclosure split
- Equipment, endorsement, pay, and safety fields and semantics
- The form fallback and conversational intake compatibility (both surface produce the same shape)

---

## 2. Field schema overview

Fields are grouped by Stage 1 (collected before matching, gates the match list) and Stage 2 (collected per-carrier, gates submission to a specific carrier).

### 2.1 Stage 1 fields

The 5-minute intake produces this record. The matching engine reads it to compute matches.

**Identity:**
- `id` (UUID, server-generated)
- `first_name` (string)
- `last_name` (string)
- `email` (string)
- `phone` (string, US format)

**Geographic:**
- `home_zip` (string, 5-digit US zip) — **primary geographic anchor**
- `home_lat` (decimal, server-computed from `home_zip` via `zip_codes` table)
- `home_lng` (decimal, server-computed from same)
- `willing_to_relocate` (boolean, default false)
- `desired_regions` (array of region enums; soft preference; see §5.2)

**Experience:**
- `years_held` (decimal, years of tractor-trailer experience)
- `otr_years` (decimal, years of OTR-specific experience; can be ≤ `years_held`)
- `cdl_state` (two-letter US state code, where the CDL was issued)

**Equipment:**
- `equipment_run` (array of equipment enums, equipment the driver has experience with)
- `desired_equipment` (array of equipment enums, equipment the driver wants to drive next)
- `endorsements` (array of endorsement enums; e.g., `hazmat`, `tanker`, `doubles-triples`)

**Work preferences:**
- `home_time` (enum: `daily`, `weekly`, `biweekly`, `otr`)
- `min_weekly_pay` (integer USD, 0 = no floor specified)

**Safety basics (Stage 1):**
- `terminated_from_any_of_last_3_employers` (boolean)
- `failed_dot_test` (boolean)
- `sap_status` (enum: `not-in-sap`, `in-sap`, `completed-sap`)

**Resume:**
- `resume_file_id` (UUID, nullable; reference to uploaded file if provided)
- `resume_parsed_at` (datetime, nullable; when resume was parsed)
- `resume_parse_confirmed_by_driver` (boolean; driver must confirm parsed values before matching per v2 attorney addendum §Q3)

**Consents (View A — captured at Stage 1):**
- `attest_accurate` (boolean, required true — driver attests info is accurate)
- `consent_to_share` (boolean, required true — driver consents to share with carriers they pick at Stage 2)
- `sms_opt_in` (boolean, default false — separate from required consents per v2 attorney addendum §Q1)

**Note:** the v2 attorney addendum recommends splitting Stage 1 consent into more granular fields (separate required + optional TCPA + voice). This spec retains the working code's 3-field structure (`attest_accurate`, `consent_to_share`, `sms_opt_in`) as the current ground truth. The granular consent structure recommended by v2 addendum is a future migration documented in the "Specs needing update" section of the INDEX.

### 2.2 Stage 2 fields

Collected after the driver clicks into a specific carrier match. Used to filter against that carrier's Stage 2 hard rules.

**Detailed safety:**
- `tickets_3yr_count` (integer)
- `accidents_3yr_count` (integer)
- `accidents_3yr_at_fault_count` (integer)
- `dui_ever` (boolean)
- `dui_most_recent_date` (date, nullable; required if `dui_ever = true`)
- `felony_ever` (boolean)

**Per-carrier consent:**
- `stage_2_consent_carrier_id` (UUID, references `carriers.id`)
- `stage_2_consent_at` (datetime)
- `stage_2_consent_text_version` (string, references the exact consent text shown)

---

## 3. Geospatial fields — detailed semantics

### 3.1 `home_zip` capture

Driver provides their 5-digit US home zip at intake. Format validation:
- Exactly 5 digits
- Looked up against `zip_codes` table; if not found, intake form shows error: "We couldn't find that zip code — could you double-check?"

ZIP+4 format (e.g., 30303-1234) is accepted but only the first 5 digits are used.

Canadian postal codes, 4-digit US zips, and other formats are rejected with a "We currently match jobs in the US — please enter a 5-digit US zip code."

### 3.2 Geocoding to lat/long

When a driver completes Stage 1, the server:
1. Looks up `home_zip` in `zip_codes` table
2. Stores `home_lat`, `home_lng` on the driver record
3. These are zip centroids — accurate to within a few miles, sufficient for hiring radius matching

If the driver later updates their zip, the lat/lng are recomputed.

### 3.3 `willing_to_relocate`

A boolean captured during intake. Meaning:

- **`willing_to_relocate = false`** (default): driver matches only jobs whose hiring radius includes their home location
- **`willing_to_relocate = true`**: driver matches all the above PLUS OTR-style jobs (jobs whose `accepted_home_time_types` includes `otr`) regardless of distance

The intent: drivers willing to move see OTR opportunities anywhere in the country. Drivers not willing to relocate see only jobs they could reasonably commute to from their current home.

### 3.4 `desired_regions` — soft preference, not hard filter

In v2, `desired_regions` was a hard filter (driver only saw carriers in those regions). In v2.1, it's a soft preference.

The geospatial location filter (driver's home location vs. job's hiring radius) is the primary geographic filter. `desired_regions` is a secondary signal used for ranking — if a driver in Aurora indicates they'd prefer the Pacific Northwest for OTR, jobs in the PNW rank higher than jobs in the Southeast, all else equal.

The driver can also pick "any" in `desired_regions` to indicate no preference.

---

## 4. Hard-filter logic for matching

A driver matches a carrier job only if all of these are true:

1. **Carrier and job status:** both must be `active`
2. **Geospatial:** EITHER `hiring_radius_miles IS NULL` (OTR hires anywhere), OR distance from driver's `(home_lat, home_lng)` to job's `(domicile_lat, domicile_lng)` is within `hiring_radius_miles`, OR `willing_to_relocate = true` AND `otr` is in `accepted_home_time_types`
3. **Equipment:** job's `equipment` is in driver's `desired_equipment` array
4. **Experience:** driver's `years_held × 12` ≥ job's `min_experience_months`
5. **OTR experience:** if job's `min_otr_experience_months` is non-null, driver's `otr_years × 12` ≥ that value
6. **CDL state:** if job's `accepted_cdl_states` is non-empty, driver's `cdl_state` is in the array
7. **Endorsements:** every endorsement in job's `required_endorsements` is in driver's `endorsements` array
8. **Home time:** driver's `home_time` is in job's `accepted_home_time_types` array
9. **Pay:** see §4.1 below
10. **Termination:** if driver's `terminated_from_any_of_last_3_employers = true`, job's `accepts_terminated` must be true
11. **DOT test:** if driver's `failed_dot_test = true`, job's `accepts_failed_dot_test` must be true
12. **SAP:** based on driver's `sap_status` and job's `sap_tolerance` per §4.2

Stage 2 hard filters (tickets, accidents, DUI, felony) apply after Stage 2 data is collected. The Stage 1 match list does not pre-filter on Stage 2 fields.

### 4.1 Pay logic

Three cases:

1. Driver `min_weekly_pay` is 0 or null (no floor specified) — all jobs pass the pay filter
2. Driver `min_weekly_pay` > 0 AND job's `pay_range_max_weekly_usd` is non-null — passes if job's max ≥ driver's floor
3. Driver `min_weekly_pay` > 0 AND job's `pay_range_max_weekly_usd` IS null — passes with `pay_warning: "pay_not_disclosed"` flag in the match result. The driver sees the job with a warning indicator. The driver decides whether to pursue.

### 4.2 SAP logic

- Job `accepts_none`: driver must be `not-in-sap`
- Job `accepts_completed_only`: driver must be `not-in-sap` OR `completed-sap`
- Job `accepts_all`: any driver SAP status passes

---

## 5. Soft-rank scoring

Among jobs that pass all hard filters, rank by descending soft-rank score.

### 5.1 Score components

- **Equipment overlap:** count of equipment types in driver's `equipment_run` that match job's `preferred_equipment_experience` array. Weighted ×2 in the composite score.
- **Region preference:** 1 if any of job's `preferred_regions` is in driver's `desired_regions`, else 0
- **Distance score:** 1 if driver's home is within 50 miles of domicile, 0.5 if within `hiring_radius_miles`, 0 otherwise (only relevant when the job has a radius)
- **Data quality:** `complete` jobs get +1, `partial` get +0.5, `minimal` get 0

### 5.2 Composite score

```
soft_rank = (equipment_overlap × 2) + region_preference + distance_score + data_quality_bonus
```

### 5.3 Tiebreaks

When soft-rank scores tie:

1. Tier 1 carriers before Tier 2 (within their respective exclusivity windows)
2. PHTP partner carriers before subscription carriers, before prospect carriers (by `carriers.kind`)
3. Most recent `last_verified_at` first
4. Stable tiebreak: job UUID descending (arbitrary but deterministic)

### 5.4 Match list size

Capped at 20. If more than 20 jobs pass hard filters, return the top 20 by soft-rank with `truncated: true` in the result.

---

## 6. Equipment, endorsement, and region enums

These enums are shared between driver intake and carrier job definitions. Both surfaces must use identical values.

### 6.1 Equipment enum

- `dry-van`
- `reefer` (refrigerated)
- `flatbed`
- `tanker` (liquid bulk)
- `tanker-hazmat` (hazmat tanker)
- `auto-hauler`
- `step-deck`
- `lowboy`
- `oversized` (specialized over-dimensional loads)
- `dump`
- `mixer` (concrete mixer)
- `intermodal`
- `box-truck` (typically straight truck CDL-A roles)

### 6.2 Endorsement enum

- `hazmat`
- `tanker`
- `doubles-triples`
- `passenger`
- `school-bus`
- `tww` (TWIC card)

### 6.3 Region enum

Used only for soft preference in v2.1.

- `northeast`
- `mid-atlantic`
- `southeast`
- `florida`
- `midwest`
- `great-plains`
- `texas`
- `southwest`
- `mountain-west`
- `pacific-northwest`
- `california`
- `any` (driver indicates no regional preference)

### 6.4 Home time enum

- `daily` (home every day)
- `weekly` (home weekly, typically weekends)
- `biweekly` (home every other weekend)
- `otr` (over the road, 2+ weeks out)

---

## 7. Match result shape

The matching engine returns:

```typescript
type MatchResult = {
  driverId: UUID;
  matchedAt: Date;
  matches: Match[];
  truncated: boolean;  // true if more than 20 hard-filter passes
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
  exclusivityWindowEndsAt: Date | null;  // non-null only for Tier 1 jobs still in window
  verificationStatus: 'verified' | 'stale' | 'unverified';
  dataQuality: 'complete' | 'partial' | 'minimal';
};
```

### 7.1 Label mapping

- `carrierTier = 'tier_1'` → label = `'Sponsored Match'`
- `carrierKind = 'partner'` AND `carrierTier ≠ 'tier_1'` → label = `'Referral Partner'`
- `carrierKind = 'prospect'` AND `carrierTier ≠ 'tier_1'` → label = `'Public Job Posting'`
- `carrierKind = 'subscription'` AND `carrierTier = 'none'` → label = `null` (no label)
- If both partner AND tier_1 apply, `'Sponsored Match'` takes precedence

These labels are driver-facing and require frontend rendering with associated tooltips per v2 attorney addendum §Q7.

---

## 8. Form fallback compatibility

Both intake surfaces (conversational AI / Debbie, and the 3-step form fallback) produce the same field shape per this schema. The matching engine doesn't know or care which surface the driver used.

Implementation note: Debbie's transcription and resume parsing may produce values that need normalization (e.g., "I've been driving for about a year and a half" → `years_held = 1.5`). The intake form fallback enforces structured input. Both produce the same downstream record.

---

## 9. Open questions

### 9.1 Driver location update flow

If a driver moves and updates their `home_zip`, what happens to their existing matches?

- Match list is re-computed on next visit
- Existing exclusivity windows persist (they're tied to driver+carrier pairs, not driver+location)
- Saved/favorited matches remain visible but flagged if they're no longer geographically eligible

This is implementation detail belonging in the Core Technical Spec v5.

### 9.2 Multi-zip drivers

Some drivers have multiple addresses (e.g., a primary residence and a secondary in another state). The schema supports one zip per driver. V2.1 punts.

### 9.3 Drivers without US zip codes

Some prospective drivers may not have a US address (recent immigrants, dispatched from corporate addresses, etc.). V2.1 doesn't support this. They'd be blocked at intake. Real concern at scale.

### 9.4 Resume parsing semantics with geospatial

If a driver uploads a resume containing prior work locations, can those inform their `desired_regions` or willingness to relocate?

V2.1: no. Resume parsing populates work history fields, not location preferences. The driver manually sets `home_zip`, `willing_to_relocate`, `desired_regions`.

---

## 10. Migration from v2

Existing driver records have all v2 fields. Migration to v2.1:

1. **Add new fields to drivers table:** `home_lat`, `home_lng`, `willing_to_relocate`
2. **Backfill `home_lat`, `home_lng`** by geocoding existing `home_zip` values against the new `zip_codes` table
3. **Default `willing_to_relocate = false`** for existing drivers
4. **`desired_regions` field unchanged** — semantics shift from hard to soft filter is enforced at the engine layer, not by changing the field itself

Driver-facing intake surfaces (form, Debbie) need updates to:
- Capture `willing_to_relocate` (new question)
- Reframe the regions question as a soft preference rather than a hard requirement

These intake surface changes are part of the existing "Specs needing update" list in the INDEX — Driver Intake Form (Fallback) v1 and Conversational AI Intake v1 both need refresh.

---

## 11. Change log

| Date | Change | By |
|------|--------|-----|
| 2026-05-19 | v1 created | Todd + Claude |
| 2026-05-19 | v2 reconciled against working code, View A locked | Todd + Claude |
| 2026-05-21 | v2.1 — geospatial driver location fields, `willing_to_relocate` field, `desired_regions` demoted to soft preference. Replaces v2. | Todd + Claude |

---

*End of spec.*
