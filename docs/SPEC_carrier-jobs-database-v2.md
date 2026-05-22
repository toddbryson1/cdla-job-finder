# Carrier Jobs Database Schema — CDLA.jobs

**Version:** 2.0
**Status:** Locked (engineering reference; supersedes Carrier Rules Database v1)
**Audience:** Engineering, product
**Owner:** Todd Bryson
**Companion documents:** Matching Engine Field Schema v2.1, Matching Engine Build Session Prompt v2, Prospect Carrier Job Ingestion Spec v1, Core Technical Spec v5 [STUB]

---

## 1. Purpose and what changed from v1

This document specifies the **carrier jobs database** — the structure of stored carrier job postings and hiring criteria that the matching engine queries against. It supersedes **Carrier Rules Database v1**.

The structural changes from v1:

- **Geospatial model.** Each job has a specific domicile location (latitude/longitude) and hiring radius (miles), replacing the coarse region enum from v1.
- **One row per job, not one row per (carrier, region, equipment) combination.** A carrier with 5 terminals × 3 equipment types might have had 15 rule rows in v1; in v2 it has 15 job rows, but each one has a real domicile and radius.
- **Application surface classification.** Each job records what kind of application form the carrier uses (Tenstreet IntelliApp, custom intake form, email only, phone only, or unknown). The matching engine returns this so the driver experience can branch correctly.
- **Data provenance and quality fields.** Each job records where the data came from (manual partner intake, FMCSA-seeded scrape, etc.) and how complete the criteria are.

What did not change:
- The hard-filter criteria fields (experience, equipment, endorsements, pay, safety) are conceptually the same. They moved from `carrier_hiring_rules` to `carrier_jobs` and gained data-quality flags but otherwise carry over.
- The `carriers` table is largely the same as v1 (identity, kind, tier, status, contact, subscription state).

---

## 2. Tables

The database has two primary tables:

- **`carriers`** — one row per carrier we work with. Identity, tier, contact, subscription state, status.
- **`carrier_jobs`** — one row per (carrier, domicile, equipment) job posting. The matching engine queries this table.

Plus one supporting table for geospatial lookups:

- **`zip_codes`** — static lookup of US zip codes to latitude/longitude. Populated once at deploy; not modified at runtime.

---

## 3. `carriers` table

Mostly unchanged from v1. Carries over:

### 3.1 Identity fields

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `name` | string | Carrier name as drivers see it |
| `legal_name` | string | Legal entity for contracts and compliance |
| `kind` | enum: `partner`, `prospect`, `subscription` | Same semantics as v1 §3.2 |
| `tier` | enum: `tier_1`, `tier_2`, `none` | Same semantics as v1 §3.3 |
| `status` | enum: `active`, `paused`, `archived` | Same semantics as v1 |
| `created_at` | datetime | |
| `updated_at` | datetime | |

### 3.2 Contact and identification fields

| Field | Type | Notes |
|-------|------|-------|
| `primary_contact_email` | string (nullable) | |
| `primary_contact_name` | string (nullable) | |
| `primary_contact_phone` | string (nullable) | |
| `public_careers_url` | string (nullable) | Carrier's main careers page (used by ingestion pipeline) |
| `tenstreet_account_id` | string (nullable) | Tenstreet account if applicable (or PHTP's account for partner carriers) |
| `fmcsa_mc_number` | string (nullable) | MC number for census-seeded prospects |
| `fmcsa_dot_number` | string (nullable) | DOT number |
| `business_address_lat` | decimal (nullable) | Latitude of carrier's primary business address (from FMCSA census) |
| `business_address_lng` | decimal (nullable) | Longitude of same |

The `business_address_*` fields are a fallback for prospect carriers whose individual job domiciles haven't been determined yet. The matching engine treats these as a last-resort domicile if no job-specific domicile is available.

### 3.3 Subscription state fields (Tier 1)

| Field | Type | Notes |
|-------|------|-------|
| `tier_1_started_at` | datetime (nullable) | When Tier 1 subscription began |
| `tier_1_renewed_at` | datetime (nullable) | Most recent renewal date |
| `tier_1_billing_status` | enum: `current`, `past_due`, `cancelled` (nullable) | Carriers in `past_due` or `cancelled` revert to Tier 2 placement |

### 3.4 PHTP partner state fields (`kind = partner` only)

| Field | Type | Notes |
|-------|------|-------|
| `phtp_referral_agreement_active` | boolean | If false, treat as Tier 2 subscription if any |
| `phtp_referral_agreement_signed_at` | datetime (nullable) | |
| `phtp_per_hire_bounty_usd` | integer (nullable) | Reference only, not used by matching engine |

---

## 4. `carrier_jobs` table

One row per job. A carrier with multiple terminals and equipment types has multiple job rows. The matching engine queries this table.

### 4.1 Identity fields

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `carrier_id` | UUID | Foreign key to `carriers.id` |
| `status` | enum: `active`, `paused`, `archived` | Intersected with carrier status during matching (both must be active) |
| `position_title` | string | Job title as carriers express it ("OTR CDL-A Reefer Driver — Atlanta Terminal") |
| `description` | string (nullable) | Longer position description for the driver's match card |
| `created_at` | datetime | |
| `updated_at` | datetime | |

### 4.2 Geospatial fields

The core geospatial model — what's new in v2.

| Field | Type | Notes |
|-------|------|-------|
| `domicile_city` | string | Human-readable city ("Aurora") |
| `domicile_state` | string | Two-letter state ("CO") |
| `domicile_zip` | string (nullable) | 5-digit US zip code if known |
| `domicile_lat` | decimal | Latitude of domicile/terminal — used for distance queries |
| `domicile_lng` | decimal | Longitude of same |
| `hiring_radius_miles` | integer (nullable) | Maximum distance from domicile the carrier hires drivers. NULL = no radius limit (OTR hires from anywhere) |

The matching engine queries: *"For each active job, is the driver's home location within `hiring_radius_miles` of the job's `(domicile_lat, domicile_lng)`?"* This is the geospatial hard filter.

For OTR jobs that hire nationally: `hiring_radius_miles = NULL` means "no distance restriction." The geospatial filter always passes.

### 4.3 Equipment field

| Field | Type | Notes |
|-------|------|-------|
| `equipment` | enum | One value from the equipment enum (see Field Schema v2.1 §7.1). Examples: `dry-van`, `reefer`, `flatbed`, `tanker`, `hazmat`, `auto-hauler`, `tanker-hazmat` |

Each row is one job for one equipment type. A carrier hiring for reefer AND dry van at the same domicile has two rows, not one.

### 4.4 Hard-filter rule fields

These define the carrier's acceptance criteria. Same fields as v1 §4.2, carried over. Each maps to a field on the driver intake. A driver matches this job only if their value satisfies the job's rule for every hard-filter field.

| Field | Type | Notes | Driver field this matches against |
|-------|------|-------|-----------------------------------|
| `min_experience_months` | integer | Minimum tractor-trailer experience | `years_held` × 12 |
| `min_otr_experience_months` | integer (nullable) | If non-null, OTR-required position | `otr_years` × 12 |
| `accepted_cdl_states` | array of state codes | Empty array = all US states accepted | `cdl_state` |
| `required_endorsements` | array of endorsement enums | Driver must hold ALL listed | `endorsements` |
| `accepted_home_time_types` | array of home time enums | Driver's preference must match at least one | `home_time` |
| `pay_range_max_weekly_usd` | integer (nullable) | Maximum weekly pay carrier offers; null = pay not disclosed | `min_weekly_pay` |
| `accepts_terminated` | boolean | Accepts drivers terminated from any of last 3 employers | `terminated_from_any_of_last_3_employers` |
| `accepts_failed_dot_test` | boolean | Accepts drivers who have failed a DOT drug/alcohol test | `failed_dot_test` |
| `sap_tolerance` | enum: `accepts_none`, `accepts_completed_only`, `accepts_all` | Same semantics as v1 | `sap_status` |
| `max_tickets_3yr` | integer | Maximum acceptable moving violation count in last 3 years | `tickets_3yr_count` (Stage 2) |
| `max_accidents_3yr` | integer | Maximum acceptable total accident count in last 3 years | `accidents_3yr_count` (Stage 2) |
| `max_at_fault_accidents_3yr` | integer | Maximum acceptable at-fault accident count | `accidents_3yr_at_fault_count` (Stage 2) |
| `accepts_dui` | boolean | If true, see `dui_max_recency_months` | `dui_ever` (Stage 2) |
| `dui_max_recency_months` | integer (nullable) | If `accepts_dui = true`, max age of most recent DUI in months. Null = any recency | `dui_most_recent_date` (Stage 2) |
| `accepts_felony` | boolean | Accepts drivers with any felony conviction | `felony_ever` (Stage 2) |

### 4.5 Soft-rank fields

| Field | Type | Notes |
|-------|------|-------|
| `preferred_equipment_experience` | array of equipment enums | Equipment types the carrier values most; drivers who have run these rank higher |
| `preferred_regions` | array of region enums | Soft preference matching driver's `desired_regions`. Used for ranking only, not as a hard filter |

Soft-rank scoring computed at match time:
- **Equipment overlap score:** count of equipment types in driver's `equipment_run` that match `preferred_equipment_experience`
- **Region preference score:** 1 if any of job's `preferred_regions` matches driver's `desired_regions`, else 0
- **Distance score:** 1 if driver's home is within 50 miles of domicile, 0.5 if within hiring_radius, 0 otherwise

Combined soft-rank score (used for ordering):
```
soft_rank = (equipment_overlap × 2) + region_preference + distance_score
```

Equipment overlap weighted more heavily because equipment fit is a stronger signal of mutual interest than region preference. Distance is a tiebreaker.

### 4.6 Application surface fields

What kind of application form the carrier uses. This determines how the driver applies when they pick this job at Stage 2.

| Field | Type | Notes |
|-------|------|-------|
| `application_surface` | enum: `tenstreet_intelliapp`, `custom_intake_form`, `email_only`, `phone_only`, `unknown` | See §4.6.1 |
| `application_url` | string (nullable) | URL to the application form. Required for `tenstreet_intelliapp` and `custom_intake_form`. |
| `application_email` | string (nullable) | Email address to send applications to. Required for `email_only`. |
| `application_phone` | string (nullable) | Phone number for the driver to call. Required for `phone_only`. |
| `application_form_schema` | jsonb (nullable) | Field-mapping schema for `custom_intake_form` submission. See §4.6.2 |
| `last_application_surface_verified_at` | datetime (nullable) | Last time the application surface was confirmed accurate (manual or scrape) |

#### 4.6.1 Application surface semantics

- **`tenstreet_intelliapp`** — The carrier uses Tenstreet's IntelliApp for the full application. This is a Type 2 form (contains SSN, FCRA authorizations). The driver deep-links to the IntelliApp and completes it themselves. The platform does NOT pre-fill or submit on the driver's behalf.

- **`custom_intake_form`** — The carrier has a Type 1 pre-application form on their careers page. Driver-provided data only (no SSN, no FCRA authorizations). The platform submits the prequalification to this form on the driver's behalf after Stage 2 per-carrier consent. The carrier handles all FCRA work in their follow-up process.

- **`email_only`** — The carrier accepts applications by email. The platform sends the prequalification (formatted as text or PDF attachment) to `application_email` after Stage 2 per-carrier consent. Same legal posture as `custom_intake_form` — driver-provided data only.

- **`phone_only`** — The carrier has no online application. The driver must call. The platform shows the carrier's phone number with a "Call Carrier" button. No automated submission.

- **`unknown`** — The application surface hasn't been classified yet. The platform either filters this job out of matching or shows it with a generic "Apply directly at [public_careers_url]" link.

#### 4.6.2 `application_form_schema` structure

For `custom_intake_form`, the schema tells the submission engine how to map our prequalification data to the carrier's form fields. JSON structure:

```json
{
  "form_url": "https://carrier.com/careers/apply",
  "method": "POST",
  "fields": {
    "first_name": { "selector": "input[name='fname']", "source": "driver.first_name" },
    "last_name": { "selector": "input[name='lname']", "source": "driver.last_name" },
    "email": { "selector": "input[name='email']", "source": "driver.email" },
    "phone": { "selector": "input[name='phone']", "source": "driver.phone", "format": "phone_us" },
    "experience_years": { "selector": "select[name='exp']", "source": "driver.years_held", "format": "rounded_string" },
    "equipment": { "selector": "input[name='equip']:checked", "source": "driver.equipment_run", "format": "first_match" },
    "resume": { "selector": "input[name='resume']", "source": "driver.resume_file", "format": "file_upload" }
  },
  "success_indicators": [
    { "type": "url_contains", "value": "/thank-you" },
    { "type": "text_contains", "value": "Thank you for applying" }
  ],
  "failure_indicators": [
    { "type": "text_contains", "value": "Error" },
    { "type": "text_contains", "value": "required field" }
  ],
  "anti_bot": { "type": "none" }
}
```

This schema is per-carrier. It's authored manually during carrier onboarding (for partner carriers) or generated by LLM-extraction (for prospect carriers, see Prospect Carrier Job Ingestion Spec).

### 4.7 Data provenance and quality

| Field | Type | Notes |
|-------|------|-------|
| `data_source` | enum: `manual_partner_intake`, `manual_subscription_onboarding`, `fmcsa_census_scrape`, `tenstreet_feed`, `carrier_self_service`, `llm_extract_from_posting` | How this job entered the database |
| `source_url` | string (nullable) | Original URL for scraped jobs |
| `last_verified_at` | datetime (nullable) | Last time this job was confirmed accurate (manual review for partners, scrape success for prospects) |
| `verification_status` | enum: `verified`, `stale`, `unverified` | Verified = `last_verified_at` within 90 days; stale = 90–180 days; unverified = >180 days or null |
| `data_quality` | enum: `complete`, `partial`, `minimal` | See §4.7.1 |

#### 4.7.1 Data quality tiers

- **`complete`** — All hard-filter fields are populated with confident values. The match is fully reliable. Typical for manually-onboarded partner carriers.

- **`partial`** — Some hard-filter fields are populated, others are inferred from defaults or left as "we don't know." The match is approximate. Typical for prospects scraped from public job postings — many criteria aren't published, so we use conservative defaults (e.g., `accepts_terminated = false` if we don't know).

- **`minimal`** — Only basic fields are known: equipment, domicile, hiring radius, application surface. Hard-filter fields use defaults across the board. The match is best-effort. Typical for FMCSA census-only prospects with no job posting parsed.

Data quality affects ranking: `complete` jobs rank higher than `partial`, which rank higher than `minimal`. Drivers see all three but are subtly steered toward better-curated matches.

---

## 5. `zip_codes` table

Static lookup for geocoding. Populated once at deploy from a public zip code database (US Postal Service or similar).

| Field | Type | Notes |
|-------|------|-------|
| `zip` | string (PK) | 5-digit US zip code |
| `city` | string | Primary city name |
| `state` | string | Two-letter state |
| `lat` | decimal | Centroid latitude |
| `lng` | decimal | Centroid longitude |

Approximately 42,000 rows. Read-only at runtime. Centroid accuracy is sufficient for hiring radius matching (typically 50+ miles).

A driver's home zip is geocoded once at intake by joining against this table.

---

## 6. Cross-table validation rules

1. **A job's effective status is `min(carrier.status, job.status)`** for matching purposes. A job on a paused carrier doesn't match regardless of the job's own status.

2. **Tier 1 exclusivity applies at the job level**, but the window is tracked at the carrier level. When a driver matches multiple jobs from the same Tier 1 carrier, all are exclusive simultaneously based on the carrier's `tier_1_started_at` and the per-driver first-match timestamp.

3. **A carrier with `kind = prospect` should not have `tier ≠ none`.** Prospects are by definition not subscribers.

4. **A job must have either valid `(domicile_lat, domicile_lng)` OR fall back to carrier's `business_address_*`** for the geospatial filter to function. Jobs with no usable location data are excluded from matching with `data_quality = minimal`.

5. **`application_url` is required when `application_surface IN ('tenstreet_intelliapp', 'custom_intake_form')`.** `application_email` is required for `email_only`. `application_phone` is required for `phone_only`. Validation enforced at write time.

6. **`application_form_schema` is required when `application_surface = 'custom_intake_form'`.** Without it, the submission engine can't operate. The job either gets a schema or its surface is downgraded to `unknown`.

---

## 7. Mapping to the Matching Engine Field Schema v2.1

For each hard-filter driver field, the corresponding carrier job field is listed in §4.4. The geospatial fields are new:

| Driver field | Job field | Logic |
|--------------|-----------|-------|
| `home_zip` (geocoded to lat/lng via zip_codes table) | `domicile_lat`, `domicile_lng`, `hiring_radius_miles` | Distance via haversine; passes if distance ≤ radius, OR if `hiring_radius_miles IS NULL` (OTR hires anywhere) |
| `willing_to_relocate` | `home_time` and `hiring_radius_miles` | If driver is true AND job's `accepted_home_time_types` includes `otr`, the radius check is bypassed |
| `desired_regions` | `preferred_regions` | Used for soft-rank scoring only; not a hard filter |

Other mappings (experience, equipment, endorsements, pay, safety) carry over unchanged from v1 §6.

---

## 8. Data hygiene and admin requirements

### 8.1 Required for any job to be considered "complete"

A job is `data_quality = complete` only when all of these are non-null and the carrier is active:

- `domicile_city`, `domicile_state`, `domicile_lat`, `domicile_lng`
- `hiring_radius_miles` (or explicitly null for OTR-anywhere jobs)
- `equipment`
- `min_experience_months`
- `accepted_cdl_states` (can be empty array = all states)
- `accepted_home_time_types` (must have at least one value)
- `accepts_terminated`, `accepts_failed_dot_test`, `sap_tolerance`
- Stage 2: `max_tickets_3yr`, `max_accidents_3yr`, `max_at_fault_accidents_3yr`, `accepts_dui`, `accepts_felony`
- `application_surface` (must be one of the four known surfaces, not `unknown`)
- Application-surface-specific required field (URL, email, or phone)

Incomplete jobs default to `data_quality = partial` or `minimal` based on what's populated.

### 8.2 Recommended fields for high-quality matches

- `required_endorsements` (even empty array is information)
- `pay_range_max_weekly_usd` (drivers with pay floors only see disclosed-pay carriers cleanly)
- `display_pay_range_min_weekly_usd`, `display_pay_range_max_weekly_usd` (for card display)
- `position_title` (vague titles like "CDL-A Driver" hurt engagement)
- `preferred_equipment_experience` (drives soft-rank)
- `preferred_regions` (drives soft-rank)
- `last_application_surface_verified_at` (kept fresh by ingestion pipeline)

### 8.3 Stale-job handling

Jobs where `last_verified_at` is more than 180 days old:

- Continue to match but rank lower
- Flagged in admin tooling for refresh
- For prospects, trigger a re-scrape; if the public job post is gone, archive the job

### 8.4 Application surface verification

Application surfaces change. Carriers redesign their careers pages, switch from custom forms to Tenstreet, retire phone-only application processes. The ingestion pipeline re-verifies surfaces on a rolling cadence (recommended: every 30 days for active jobs).

Jobs with `last_application_surface_verified_at` more than 60 days old have their submission attempts wrapped with extra error handling — if the form schema doesn't match the carrier's current page, the submission fails gracefully and the job is flagged for re-classification.

---

## 9. Display fields

For showing the job in a driver's match card. Not used by matching logic.

| Field | Type | Notes |
|-------|------|-------|
| `display_pay_range_min_weekly_usd` | integer (nullable) | Lower bound of pay range as advertised |
| `display_pay_range_max_weekly_usd` | integer (nullable) | Upper bound; if both null, card shows "Pay not disclosed" warning |
| `display_signing_bonus_usd` | integer (nullable) | Signing bonus if advertised |
| `display_home_time_description` | string (nullable) | Free-text home time ("Home every weekend") |
| `display_lane_description` | string (nullable) | Free-text lane description if narrower than the region |
| `display_benefits_summary` | string (nullable) | Brief benefits text |

---

## 10. Open questions

### 10.1 Multi-domicile jobs

Some carriers post a single job that hires from multiple terminals. Two modeling choices:

- **Model as separate job rows per domicile** (current recommendation; cleaner architecturally)
- **Model as one job with multiple domiciles** (matches how carriers think about it but harder to query)

V2 uses separate rows. Reconsider in v3 if real-world data makes multi-domicile common.

### 10.2 Home time semantics in geospatial model

A driver who picks `home_time = daily` (home every day) needs jobs domiciled close enough that daily commuting works — maybe 50 miles. A driver who picks `home_time = otr` is fine with any radius.

V2 doesn't enforce this. The match returns jobs within hiring radius regardless of home time. Drivers picking `daily` may see jobs with 200-mile radii that aren't practical for daily commute.

Two options:
- **Add a soft warning** to the match card ("This job is 90 miles from your home — daily commute may be difficult")
- **Tighten the radius for `daily` home-time drivers** to ~50 miles regardless of the job's stated radius

V2 punts to the display layer to show domicile distance prominently. The driver decides if it's practical. V3 could add the tightening logic.

### 10.3 Equipment-specific hiring radii

Some carriers hire drivers anywhere for OTR but only locally for regional work. Different equipment types might have different effective radii.

V2 models radius per job row, so this is captured naturally — a carrier with OTR reefer (no radius) and regional dry van (75-mile radius) has two job rows with different radii.

### 10.4 Tier 1 exclusivity window state

Per v1 §8.5, the exclusivity window is tracked at the carrier level via `tier_1_started_at`. Per-driver exclusivity is a (driver, carrier_id, job_id, match_timestamp) tuple — different drivers matched at different times have different window expirations.

This state lives in a separate table (`driver_carrier_matches` or similar) that records each match event. Out of scope for this schema spec; covered in Core Technical Spec v5.

### 10.5 Job archiving

When a job is no longer hiring, it gets `status = archived` rather than deleted. This preserves historical match data (if a driver matched the job and applied, the record persists).

How long do archived jobs stay in the database? V2 punts to a Core Technical Spec v5 retention policy. Recommendation: 4 years to align with TCPA/FCRA records retention from v2 attorney addendum §Q9.

---

## 11. Migration from v1

The Carrier Rules Database v1 schema had one table — `carrier_hiring_rules` — combining the role of `carrier_jobs` v2. Migration steps:

1. **Rename `carrier_hiring_rules` → `carrier_jobs`** (or create new table, copy data, drop old)
2. **For each existing rule row, derive a domicile:**
   - If the row had a specific city/state already, use it
   - If not, fall back to the carrier's primary business address from FMCSA
3. **Geocode the domicile** via the new `zip_codes` table or external geocoding (one-time)
4. **Set `hiring_radius_miles`** based on the region enum:
   - `local`, `regional`: 75 miles default
   - `otr`: NULL (no radius)
   - Other coarse regions: 200 miles default, flagged for refresh
5. **Set `application_surface`:**
   - Partner carriers: known from PHTP/Tenstreet relationship (typically `tenstreet_intelliapp`)
   - Subscription carriers: known from carrier onboarding
   - Prospect carriers: `unknown` until ingestion pipeline classifies
6. **Backfill data quality:**
   - Partner carriers: `data_quality = complete`
   - Subscription carriers: `data_quality = complete`
   - Prospects: `data_quality = partial` or `minimal` depending on what's known

This is a substantial migration. It should be done in a single transaction with verification queries before commit. The migration plan is detailed further in the Matching Engine Build Session Prompt v2.

---

## 12. What this document does not cover

- Postgres column types, indexes, foreign key cascades — in the Drizzle schema (`src/db/schema.ts`)
- Geospatial query implementation (haversine SQL) — in the Matching Engine Build Session Prompt v2
- Admin UI for managing carriers and jobs — separate spec (Carrier Portal)
- Carrier self-service tooling — separate spec
- Match event tracking (driver × job × timestamp) — Core Technical Spec v5
- The matching engine's algorithm itself — Matching Engine Build Session Prompt v2
- Display rendering of match cards — UI layer
- The ingestion pipeline that populates this database for prospect carriers — Prospect Carrier Job Ingestion Spec v1
- The application submission engine — Prospect Carrier Job Ingestion Spec v1

---

## 13. Change log

| Date | Change | By |
|------|--------|-----|
| 2026-05-21 | v1 (Carrier Rules Database Schema) created | Todd + Claude |
| 2026-05-21 | v2 (Carrier Jobs Database Schema) created — geospatial model, application surface classification, data provenance/quality tiers, replaces v1 | Todd + Claude |

---

*End of spec.*
