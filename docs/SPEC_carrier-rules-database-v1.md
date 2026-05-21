# Carrier Rules Database Schema — CDLA.jobs

**Version:** 1.0
**Status:** Locked (engineering reference; subject to revision as real carrier data accumulates)
**Audience:** Engineering, product
**Owner:** Todd Bryson
**Companion documents:** Matching Engine Field Schema v2, Core Technical Spec v5 [STUB], Matching Engine Build Session Prompt v1

---

## 1. Purpose

This document specifies the **carrier rules database** — the structure of stored carrier hiring criteria that the matching engine queries against. It defines:

- The data shape per carrier
- The data shape per hiring rule (carrier × region × equipment)
- The relationship between carrier-level and rule-level data
- Field-level constraints and defaults
- The mapping between this schema and the Matching Engine Field Schema v2

This schema does not specify Postgres column types, indexes, or migrations. Those live in the Drizzle schema (`src/db/schema.ts`). This document specifies the logical structure; the Drizzle schema is the physical implementation.

---

## 2. Architectural context

The carrier rules database has two tables:

- **`carriers`** — one row per carrier we work with. Identity, tier, contact, status.
- **`carrier_hiring_rules`** — one row per (carrier, region, equipment) combination the carrier hires for. The matching engine queries this table.

A single carrier can have many hiring rules. A national carrier hiring reefer in the Southeast, dry van in the Midwest, and flatbed in Texas has three rule rows. Each rule row is independently matched against drivers.

This is the same structural pattern already in the working code per CLAUDE.md. This spec formalizes and extends what's there.

---

## 3. `carriers` table

### 3.1 Required fields

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `name` | string | Carrier name as drivers see it (DBA, not legal name unless they match) |
| `legal_name` | string | Legal entity name for contracts and compliance |
| `kind` | enum: `partner`, `prospect`, `subscription` | See §3.2 |
| `tier` | enum: `tier_1`, `tier_2`, `none` | See §3.3 |
| `status` | enum: `active`, `paused`, `archived` | Active = appears in matching; paused = excluded from new matches but existing matches preserved; archived = removed entirely |
| `created_at` | datetime | |
| `updated_at` | datetime | |

### 3.2 Carrier kinds

- **`partner`** — one of the 20 carriers with a PHTP referral agreement. Per-hire bounty paid to PHTP. Appears in driver match results labeled "Referral Partner" per v2 attorney addendum.
- **`prospect`** — non-partner carrier seeded from FMCSA Motor Carrier Census. Appears in driver matches when public job posts align. No commercial relationship at time of match. Triggers Prospect Carrier Outreach Email when a driver submits.
- **`subscription`** — carrier paying Tier 1 ($2,500/month) or Tier 2 (free) subscription directly to CDLA.jobs. No referral fee.

A carrier's `kind` can change over time (prospect converts to subscription, partner subscription added on top of referral, etc.). The matching engine doesn't care about kind; it cares about `tier` and `status`.

### 3.3 Tier vs. kind

`kind` describes the commercial relationship structure. `tier` describes the placement treatment in driver match results.

- A **`partner`** carrier has `tier = none` typically (PHTP-referral carriers aren't subscription-priority; they appear in matches via the referral relationship, labeled "Referral Partner")
- A **`subscription`** carrier has `tier = tier_1` or `tier = tier_2`
- A **`prospect`** carrier has `tier = none`

**Special case:** a partner carrier that also subscribes to Tier 1 has `kind = partner` (the referral relationship is the primary commercial structure) and `tier = tier_1` (Tier 1 priority placement applies). Both labels apply.

### 3.4 Optional contact fields

| Field | Type | Notes |
|-------|------|-------|
| `primary_contact_email` | string | Carrier's designated CDLA.jobs contact |
| `primary_contact_name` | string | |
| `primary_contact_phone` | string | |
| `public_careers_url` | string | URL to carrier's public careers page (used for prospect carriers) |
| `tenstreet_account_id` | string | Carrier's Tenstreet account if applicable (or PHTP's account for partner carriers) |
| `fmcsa_mc_number` | string | FMCSA Motor Carrier number for census-seeded prospects |
| `fmcsa_dot_number` | string | DOT number |

### 3.5 Subscription state fields (Tier 1 only)

| Field | Type | Notes |
|-------|------|-------|
| `tier_1_started_at` | datetime | When Tier 1 subscription began (used for exclusivity window calculations) |
| `tier_1_renewed_at` | datetime | Most recent renewal date |
| `tier_1_billing_status` | enum: `current`, `past_due`, `cancelled` | Tier 1 carriers in `past_due` or `cancelled` revert to Tier 2 placement |

### 3.6 PHTP partner state fields (kind = partner only)

| Field | Type | Notes |
|-------|------|-------|
| `phtp_referral_agreement_active` | boolean | If false, carrier no longer in PHTP's per-hire program; treat as Tier 2 subscription if any |
| `phtp_referral_agreement_signed_at` | datetime | |
| `phtp_per_hire_bounty_usd` | integer | Amount PHTP receives per confirmed hire; reference only, not used by matching engine |

---

## 4. `carrier_hiring_rules` table

One row per (carrier, region, equipment) combination the carrier actively hires for. A carrier with 5 different hiring contexts has 5 rule rows.

### 4.1 Identity fields

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `carrier_id` | UUID | Foreign key to `carriers.id` |
| `equipment` | enum | One value from the equipment enum (see Field Schema v2 §7.1) |
| `region` | enum | One value from the region enum (see Field Schema v2 §7.4) |
| `status` | enum: `active`, `paused`, `archived` | Same semantics as carrier-level status; intersected with carrier status during matching (both must be active) |
| `position_title` | string | Job title as carriers express it ("OTR CDL-A Reefer Driver") |
| `created_at` | datetime | |
| `updated_at` | datetime | |

### 4.2 Hard-filter rule fields

These fields define the carrier's acceptance criteria. Each maps to a field on the driver intake. A driver matches this rule only if their value satisfies the carrier's rule for every hard-filter field.

| Field | Type | Notes | Driver field this matches against |
|-------|------|-------|-----------------------------------|
| `min_experience_months` | integer | Minimum tractor-trailer experience in months | `years_held` converted to months |
| `min_otr_experience_months` | integer (nullable) | If non-null, OTR-required position; minimum OTR months | `otr_years` converted to months |
| `accepted_cdl_states` | array of state codes | Empty array = all US states accepted | `cdl_state` |
| `required_endorsements` | array of endorsement enums | Driver must hold all listed endorsements | `endorsements` |
| `accepted_home_time_types` | array of home time enums | At least one of carrier's accepted types must match driver's preference | `home_time` |
| `pay_range_max_weekly_usd` | integer (nullable) | Maximum weekly pay carrier offers; null = pay not disclosed | `min_weekly_pay` |
| `accepts_terminated` | boolean | Accepts drivers terminated from any of last 3 employers | `terminated_from_any_of_last_3_employers` |
| `accepts_failed_dot_test` | boolean | Accepts drivers who have failed a DOT drug/alcohol test | `failed_dot_test` |
| `sap_tolerance` | enum: `accepts_none`, `accepts_completed_only`, `accepts_all` | `accepts_none` rejects all SAP statuses except `not-in-sap`; `accepts_completed_only` accepts `not-in-sap` and `completed-sap`; `accepts_all` accepts all three | `sap_status` |
| `max_tickets_3yr` | integer | Maximum acceptable moving violation count in last 3 years | `tickets_3yr_count` (Stage 2) |
| `max_accidents_3yr` | integer | Maximum acceptable total accident count in last 3 years | `accidents_3yr_count` (Stage 2) |
| `max_at_fault_accidents_3yr` | integer | Maximum acceptable at-fault accident count | `accidents_3yr_at_fault_count` (Stage 2) |
| `accepts_dui` | boolean | If true, see `dui_max_recency_months` | `dui_ever` (Stage 2) |
| `dui_max_recency_months` | integer (nullable) | If `accepts_dui = true`, max age of most recent DUI in months. Null = any recency accepted | `dui_most_recent_date` (Stage 2) |
| `accepts_felony` | boolean | Accepts drivers with any felony conviction | `felony_ever` (Stage 2) |

### 4.3 Soft-rank fields

These do not exclude carriers; they affect ranking within the match list.

| Field | Type | Notes |
|-------|------|-------|
| `preferred_equipment_experience` | array of equipment enums | Equipment types the carrier values most; drivers who have run these rank higher |

Soft-rank scoring is computed at match time:
- **Equipment overlap score:** count of equipment types in driver's `equipment_run` that match `preferred_equipment_experience`
- Final ranking is the soft-rank score (higher = better)

### 4.4 Display fields

These appear in driver match cards. Not used by matching logic.

| Field | Type | Notes |
|-------|------|-------|
| `display_pay_range_min_weekly_usd` | integer (nullable) | Lower bound of pay range as advertised to drivers |
| `display_pay_range_max_weekly_usd` | integer (nullable) | Upper bound; if both nulls, card shows "Pay not disclosed" with warning flag |
| `display_signing_bonus_usd` | integer (nullable) | Signing bonus if advertised |
| `display_home_time_description` | string (nullable) | Free-text home time description ("Home every weekend," "OTR 14-21 days out") |
| `display_lane_description` | string (nullable) | Free-text lane description if narrower than the region |
| `display_benefits_summary` | string (nullable) | Brief benefits text |
| `description` | string (nullable) | Longer position description shown when driver clicks into the carrier card |

### 4.5 Source tracking

| Field | Type | Notes |
|-------|------|-------|
| `rule_source` | enum: `manual_partner_intake`, `manual_subscription_onboarding`, `fmcsa_census_scrape`, `tenstreet_feed`, `carrier_self_service` | How this rule entered the database |
| `source_url` | string (nullable) | Original URL for prospect-scraped rules |
| `last_verified_at` | datetime | Last time this rule was confirmed accurate (manual review for partners, scrape success for prospects) |
| `verification_status` | enum: `verified`, `stale`, `unverified` | Verified = last_verified_at within 90 days; stale = 90-180 days; unverified = >180 days or never |

Stale and unverified rules can still match but are flagged in admin tooling for review. The matching engine doesn't downrank stale rules in v1.

---

## 5. Cross-table validation rules

These constraints apply to relationships between the two tables.

1. **A rule's status is effectively `min(carrier.status, rule.status)`** for matching purposes. A rule on a paused carrier doesn't match regardless of the rule's own status.

2. **Tier 1 exclusivity applies at the rule level, but the window is tracked at the carrier level.** When a driver matches multiple rules from the same Tier 1 carrier, all are exclusive simultaneously based on the carrier's `tier_1_started_at` and the per-driver match timestamp.

3. **A carrier with `kind = prospect` should not have `tier ≠ none`.** Prospects are by definition not subscribers. Migration of a prospect to subscription requires both fields updated atomically.

4. **A rule must have `equipment` and `region` set.** Universal rules (carrier hires for any equipment anywhere) are represented as multiple rule rows, one per real combination, not as nulls.

---

## 6. Mapping to the Matching Engine Field Schema v2

For each hard-filter driver field in Field Schema v2, the corresponding carrier rule field is listed in §4.2 above. A few mappings worth calling out explicitly:

| Driver field | Carrier rule field | Logic |
|--------------|---------------------|-------|
| `cdl_state` | `accepted_cdl_states` | Driver's state must be in the array, or array must be empty (all states) |
| `experience_months` (derived from `years_held`) | `min_experience_months` | Driver's months must be ≥ rule's minimum |
| `otr_years` (converted to months) | `min_otr_experience_months` | If rule's minimum is non-null, driver's months must be ≥ minimum |
| `endorsements` | `required_endorsements` | Every endorsement in `required_endorsements` must be in driver's `endorsements` |
| `desired_equipment` | rule's `equipment` | Rule's equipment must be in driver's `desired_equipment` array |
| `desired_regions` | rule's `region` | Rule's region must be in driver's `desired_regions` array (or driver has `any` in regions) |
| `home_time` | `accepted_home_time_types` | Driver's preference must be in the carrier's accepted array |
| `min_weekly_pay` | `pay_range_max_weekly_usd` | If driver's floor > 0 and carrier's max is null → "pay not disclosed" warning. If both non-null, carrier's max must be ≥ driver's floor |
| `terminated_from_any_of_last_3_employers` | `accepts_terminated` | If driver is true, carrier's `accepts_terminated` must be true |
| `failed_dot_test` | `accepts_failed_dot_test` | If driver is true, carrier's `accepts_failed_dot_test` must be true |
| `sap_status` | `sap_tolerance` | See enum semantics in §4.2 |
| Stage 2 — `tickets_3yr_count` | `max_tickets_3yr` | Driver's count must be ≤ rule's maximum |
| Stage 2 — `accidents_3yr_count` | `max_accidents_3yr` | Driver's count must be ≤ rule's maximum |
| Stage 2 — `accidents_3yr_at_fault_count` | `max_at_fault_accidents_3yr` | Driver's count must be ≤ rule's maximum |
| Stage 2 — `dui_ever` | `accepts_dui` (+ `dui_max_recency_months`) | If driver is true, carrier's `accepts_dui` must be true; if rule's recency is non-null, driver's DUI date must be within window |
| Stage 2 — `felony_ever` | `accepts_felony` | If driver is true, carrier's `accepts_felony` must be true |

---

## 7. Data hygiene and admin requirements

These aren't matching engine concerns but they affect data quality and need to exist in admin tooling.

### 7.1 Required for any rule to be considered "complete"

A rule is "complete" only when all of these are non-null and the carrier is active:

- `min_experience_months`
- `accepted_cdl_states` (can be empty array, which means "all states")
- `accepted_home_time_types` (must have at least one value)
- `accepts_terminated`
- `accepts_failed_dot_test`
- `sap_tolerance`
- Stage 2 fields: `max_tickets_3yr`, `max_accidents_3yr`, `max_at_fault_accidents_3yr`, `accepts_dui`, `accepts_felony`

Incomplete rules can exist in the database but are excluded from matching. Admin UI flags them as "needs setup" for the carrier intake team.

### 7.2 Recommended fields for high-quality matches

Beyond complete, these improve match quality and should be filled where possible:

- `required_endorsements` (even if empty array; explicit absence is information)
- `pay_range_max_weekly_usd` (drivers with pay floors only see carriers where this is known and met)
- `display_pay_range_min_weekly_usd` and `display_pay_range_max_weekly_usd` (for display in match cards)
- `position_title` (drivers see this; vague titles like "CDL-A Driver" hurt engagement)
- `preferred_equipment_experience` (drives soft-rank)

### 7.3 Stale-rule handling

Rules where `last_verified_at` is more than 180 days old should:

- Continue to match (v1 behavior; we don't suppress unverified rules)
- Be flagged in admin tooling for the carrier intake team to refresh
- For prospects, trigger a re-scrape attempt; if the carrier's public job post is gone, the rule should be archived

A future v2 enhancement: downrank stale rules in the soft-rank computation. Not in v1.

---

## 8. Open questions

### 8.1 Pay range vs. pay structure

V1 uses a single `pay_range_max_weekly_usd` field. Real carrier pay structures vary widely — CPM (cents per mile), percentage, weekly minimum, daily, hourly, salary, mixed. Compressing all of this into "weekly USD" requires conversion that's lossy.

For matching, "weekly USD equivalent" is the right normalization. For display, drivers may want to see the actual structure ("$0.65/mile + $200/week minimum") rather than the normalized number.

V1 punts: store the normalized weekly USD for matching, store free-text in `display_pay_range_*` for showing the driver. V2 could add structured pay-type fields.

### 8.2 Equipment specificity

The equipment enum has values like `reefer`, `dry-van`, `flatbed` but doesn't distinguish e.g. a dry van pulling auto parts from a dry van pulling general freight, or a flatbed pulling steel from a flatbed pulling lumber. Some carriers care; some don't.

V1 treats equipment as a coarse enum. V2 could add a `freight_specifics` array of free-text or sub-enum values.

### 8.3 Lane-specific rules within a region

A carrier hiring "OTR in the Midwest" might actually want drivers based in specific metros (Indianapolis, Columbus, St. Louis) rather than anywhere in the region. The rule schema doesn't currently capture this granularity.

V1 punts to free-text in `display_lane_description`. Drivers see it on the card but matching is region-level. V2 could add a `lane_zip_centers` array or similar.

### 8.4 Time-of-day or seasonal rules

Some carriers hire heavily in spring and pause in winter. Some have weekday-only recruiters. The rule schema doesn't capture temporal patterns.

V1: rules are on/off via `status`. Carriers pause rules manually when they're not hiring. Admin UI should make this easy. V2 could add scheduled status changes.

### 8.5 Tier 1 exclusivity window state

§5.2 says the exclusivity window is tracked at the carrier level via `tier_1_started_at`. But the per-driver exclusivity is actually a (driver, carrier_id, rule_id, match_timestamp) tuple — different drivers matched at different times have different window expirations.

The carrier rules database doesn't store this state. It lives in a separate table (likely `driver_carrier_matches` or similar) that records each match event and its exclusivity window. This is a Core Technical Spec v5 concern, not a carrier-rules-schema concern. Flagged here so it's not assumed to live in the rules database.

---

## 9. Migration from current code

Per CLAUDE.md, the working code has `carriers` and `carrier_hiring_rules` tables already, plus a `drivers` table. This spec describes the target state. Migrations needed:

1. **Add new carrier-level fields** for tier_1 subscription tracking (`tier_1_started_at`, `tier_1_renewed_at`, `tier_1_billing_status`), PHTP partner tracking (`phtp_referral_agreement_active`, etc.), and Tenstreet account ID
2. **Add new rule-level fields** for Stage 2 safety (`max_tickets_3yr`, `max_accidents_3yr`, `max_at_fault_accidents_3yr`, `accepts_dui`, `dui_max_recency_months`, `accepts_felony`), explicit OTR experience (`min_otr_experience_months`), endorsement requirements (`required_endorsements`), home time array (`accepted_home_time_types`), and SAP tolerance enum (`sap_tolerance`)
3. **Add source tracking fields** (`rule_source`, `source_url`, `last_verified_at`, `verification_status`)
4. **Add soft-rank field** (`preferred_equipment_experience`)
5. **Update existing seed data** to populate new fields with sensible defaults (`sap_tolerance = accepts_none`, `accepts_terminated = false`, etc.)

Engineering should run a Drizzle migration plus a data backfill script. Field defaults should be conservative — when in doubt, restrict rather than permit, so drivers don't see matches that wouldn't actually qualify them.

---

## 10. What this document does not cover

- Postgres column types, indexes, foreign key cascades — in the Drizzle schema (`src/db/schema.ts`)
- Admin UI for managing carriers and rules — separate spec (Carrier Portal)
- Carrier self-service tooling — separate spec
- Match event tracking (driver × carrier × timestamp) — Core Technical Spec v5
- The matching engine's algorithm itself — covered in the Matching Engine Build Session Prompt
- Display rendering of match cards — UI layer, separate

---

## 11. Change log

| Date | Change | By |
|------|--------|-----|
| 2026-05-21 | v1 created — formalizes and extends the carrier rules data structure referenced in working code | Todd + Claude |

---

*End of spec.*
