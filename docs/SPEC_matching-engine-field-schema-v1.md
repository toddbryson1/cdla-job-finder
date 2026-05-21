# Matching Engine Field Schema — CDLA.jobs

**Version:** 1.0
**Status:** Locked (pending technical review of hard-filter vs soft-rank classifications)
**Audience:** Internal — engineering, product, attorney (for the hard-filter classifications that affect adverse action questions)
**Owner:** Todd Bryson
**Companion documents:** Conversational AI Intake Spec v1, Driver Intake Form (Fallback) Spec v1 [STUB], Core Technical Spec v5 [STUB]

---

## 1. Purpose

This document specifies the structured data the matching engine consumes from the driver intake (whether via Debbie's conversational interface or the 6-step form fallback). It defines:

- The fields captured at each stage of intake
- The normalized value types and formats
- Validation rules
- The classification of each field as **hard-filter** (binary include/exclude from match results) vs. **soft-rank** (affects match ordering but does not exclude)

The schema is the contract between the front-end intake (Debbie + form fallback) and the rule-based matching backend. Changes to this schema require updates to both surfaces and to the carrier rules database.

The schema does **not** specify database column types, indexes, or storage. Those decisions live in the Core Technical Spec.

---

## 2. Architectural context

The matching engine is **deterministic and rule-based**, not LLM-driven. Driver data flows from intake to a structured set of fields. The matching engine runs each driver's fields against each carrier's stated hiring rules (stored in the partner carrier rules database). A carrier appears in the driver's match list if and only if:

1. All of the carrier's **hard-filter requirements** are met by the driver's fields, AND
2. The carrier's **soft-rank weights** combine with the driver's fields to score above a configurable threshold (default proposed: any positive score appears, ranked descending)

Hard-filter logic is binary. Soft-rank logic produces a numeric score used for ordering. The two are independent — a driver who passes all hard filters but scores low on soft rank still sees the carrier, just lower in the list.

---

## 3. Field inventory by stage

### 3.1 Stage 1 fields (collected before matches displayed)

These five fields are required before the matching engine fires.

| Field key | Display name | Type | Required | Filter/Rank |
|-----------|--------------|------|----------|-------------|
| `driver_zip` | Driver location | string (5-digit zip) | Yes | Hard-filter |
| `experience_months` | Tractor-trailer experience | integer | Yes | Hard-filter |
| `schedule_preference` | Schedule preference | enum: `regional`, `otr`, `local`, `any` | Yes | Hard-filter |
| `termination_status` | Last-job termination status | enum: `clean_separation`, `terminated_no_cause`, `terminated_cause_based`, `not_applicable` | Yes | Hard-filter |
| `termination_reason_text` | Termination reason (if applicable) | string (free text, optional) | No | None — for carrier review only |
| `sap_status` | SAP driver status | boolean | Yes | Hard-filter |

### 3.2 Stage 2 fields (collected when driver clicks into a specific carrier match)

These three fields are required to build the prequalification record for a specific carrier.

| Field key | Display name | Type | Required | Filter/Rank |
|-----------|--------------|------|----------|-------------|
| `tickets_3yr_count` | Moving violations in last 3 years | integer | Yes | Hard-filter (per carrier) |
| `tickets_3yr_text` | Tickets detail (free text) | string | No | None — for carrier review only |
| `accidents_3yr_count` | Accidents in last 3 years | integer | Yes | Hard-filter (per carrier) |
| `accidents_3yr_at_fault_count` | At-fault accidents in last 3 years | integer | Yes | Hard-filter (per carrier) |
| `accidents_3yr_text` | Accident detail (free text) | string | No | None — for carrier review only |
| `criminal_history` | Criminal history | boolean | Yes | Hard-filter (per carrier) |
| `criminal_history_text` | Criminal history detail (free text) | string | No (yes if `criminal_history` is true) | None — for carrier review only |

### 3.3 Derived / system fields

These are not collected directly from the driver but are populated by the system from other sources or computations.

| Field key | Display name | Type | Source |
|-----------|--------------|------|--------|
| `intake_completed_at` | Stage 1 completion timestamp | datetime | System (set when Stage 1 consent captured) |
| `intake_path` | How driver completed Stage 1 | enum: `chat`, `chat_with_resume`, `chat_with_voice`, `form_fallback` | System (set during intake) |
| `consent_v1_captured_at` | Stage 1 consent timestamp | datetime | System (set when consent captured) |
| `consent_v1_text_version` | Stage 1 consent language version | string | System (set when consent captured; references locked consent language version) |
| `carrier_consents` | Per-carrier consent log | array of objects: `{carrier_id, consented_at, consent_text_version}` | System (appended at each Stage 2 consent) |
| `last_match_run_at` | Last time matches were computed | datetime | System (set on each match run) |
| `nurture_state` | Current nurture sequence state | enum: `active`, `paused_post_hire`, `paused_user_request`, `unsubscribed_all` | System (managed by nurture orchestrator; out of scope for this doc) |

### 3.4 Fields explicitly NOT collected at Stage 1

The following fields appear in many job-board intakes but are intentionally excluded from CDLA.jobs's Stage 1 intake. Each is excluded for a specific reason.

| Field | Why excluded |
|-------|--------------|
| Full name | Not needed for matching; collected at Stage 2 only when driver is committing to share with a specific carrier |
| Phone number | Same — collected at Stage 2 to minimize PII surface area before consent |
| Email | Collected at Stage 1 for nurture/match delivery; not used in matching itself |
| Date of birth | Not needed for matching; carriers handle age verification within their own application |
| Social Security Number | Never collected by CDLA.jobs under any circumstances; carrier handles within DOT 391 application |
| CDL number | Never collected by CDLA.jobs; carrier handles within DOT 391 application |
| Specific endorsements (Hazmat, Tanker, Doubles/Triples) | Not in Stage 1 to keep intake short; revisit for v2 if matching engine needs them as hard filters |
| Equipment-specific experience (reefer years, flatbed years, tanker years, etc.) | Out of Stage 1 scope; current Stage 1 captures only total tractor-trailer experience |
| Specific home time preference (weekends, every 2 weeks, every 3 weeks) | `schedule_preference` enum is the v1 simplification; refine if matching data shows insufficient granularity |
| Pay range preference / target | Not in Stage 1; carriers' pay ranges are shown in match results, driver self-selects |

This list is intentional and worth defending. Each addition to Stage 1 increases drop-off. The five required fields are the minimum needed to produce a viable match. Anything not on this list belongs in Stage 2, in nurture, or in the carrier's own application.

---

## 4. Field-level specifications

This section gives the detailed contract for each Stage 1 and Stage 2 field — type, valid values, validation, extraction rules, and matching behavior.

### 4.1 `driver_zip`

- **Type:** string, exactly 5 numeric digits
- **Source:** Stage 1, Q1
- **Acceptable user inputs:** 5-digit zip, city/state (resolved to zip via lookup), "near [city]" (resolved to nearest zip via lookup)
- **Validation:** Must match a real US zip code. If ambiguous (e.g., user provides a city name with multiple zips), Debbie asks one clarifying question.
- **Matching behavior (hard-filter):** Driver's zip must fall within at least one of the carrier's hiring regions (carrier rules database stores hiring regions as zip ranges, state lists, or radius from hub).
- **Normalized format:** Plain 5-digit string. No leading "+". No zip+4.
- **Edge cases:** Driver in Alaska, Hawaii, or US territories handled by carrier-side region rules. Drivers outside the US are not eligible — Debbie surfaces this honestly if it comes up.

### 4.2 `experience_months`

- **Type:** integer, 0 or greater
- **Source:** Stage 1, Q2
- **Acceptable user inputs:** Numeric ("8 years," "18 months"), descriptive ("just got my CDL" → 0, "almost 20 years" → 240), or ranges ("3 to 4 years" → 42, the midpoint)
- **Validation:** Must be non-negative integer. Practical ceiling of 600 (50 years); anything higher prompts a confirmation question from Debbie.
- **Matching behavior (hard-filter):** Driver's `experience_months` must equal or exceed carrier's stated minimum experience for the position. Carrier rules database stores minimums in months.
- **Normalized format:** Integer in months.
- **Edge cases:** Drivers with less than 6 months of experience are treated as "new CDL" for matching purposes; many carriers require 12+ months and these drivers may see zero matches. Debbie handles zero-match honestly per intake spec §4.5.

### 4.3 `schedule_preference`

- **Type:** enum: `regional`, `otr`, `local`, `any`
- **Source:** Stage 1, Q3
- **Acceptable user inputs:** Direct match ("regional," "OTR," "local"), descriptive ("home every weekend" → regional, "home every night" → local, "out for weeks at a time" → OTR), or "flexible" / "I'll consider anything" → `any`
- **Validation:** Must resolve to one of the four enum values. If ambiguous, Debbie asks one clarifying question.
- **Matching behavior (hard-filter):** Carrier's position type must match driver's preference, OR driver's preference is `any` (carrier's position type unrestricted), OR carrier offers multiple position types and at least one matches.
- **Normalized format:** Lowercase enum string.

### 4.4 `termination_status` and `termination_reason_text`

- **Type:** enum (`termination_status`) + free string (`termination_reason_text`)
- **Source:** Stage 1, Q4
- **Acceptable user inputs:**
  - "Left on my own terms" / "quit" / "still there" → `clean_separation`
  - "Was let go" / "fired" + reason that is not cause-based (layoff, mutual decision, contract ended, end of seasonal work) → `terminated_no_cause`
  - "Was let go" / "fired" + reason that IS cause-based (accident, safety violation, behavior, attendance, drug/alcohol policy, performance) → `terminated_cause_based`
  - "Never had a trucking job" → `not_applicable`
- **Categorization logic:** The captured `termination_reason_text` is categorized by the LLM into one of the four enum values. Categorization confidence threshold proposed at 0.8; below threshold, Debbie asks one clarifying follow-up. Final classification logged for audit.
- **Matching behavior (hard-filter):**
  - `clean_separation` and `not_applicable` and `terminated_no_cause`: no filtering, all carriers accept
  - `terminated_cause_based`: only carriers whose rules explicitly accept cause-based termination remain in match results
- **Adverse action consideration:** The `terminated_cause_based` filtering excludes the driver from carriers who don't accept that history. Per attorney brief addendum Question 5, confirm this is not an adverse action requiring FCRA notice; if it is, the matching behavior may need to change to "show all matches with a disclosed pre-screen flag" rather than filter.

### 4.5 `sap_status`

- **Type:** boolean
- **Source:** Stage 1, Q5
- **Acceptable user inputs:** "Yes" / "no" / "I don't know what that is" (handled by Debbie offering one-sentence explanation per intake spec §4.2)
- **Validation:** Must resolve to true or false. "I don't know" after explanation defaults to false with a system flag.
- **Matching behavior (hard-filter):** If `sap_status` is true, only carriers whose rules explicitly accept SAP drivers remain in match results.

### 4.6 `tickets_3yr_count` and `tickets_3yr_text`

- **Type:** integer + free string
- **Source:** Stage 2, Q6
- **Acceptable user inputs:** Numeric ("two," "0," "none"), descriptive ("just one speeding ticket"), or text ("two — speeding and following too close")
- **Validation:** Count must be non-negative integer. Free text optional.
- **Matching behavior (hard-filter, per carrier):** Carrier's rule defines a maximum acceptable ticket count in last 3 years. Driver's count must be at or below carrier's threshold.
- **Edge case:** Drivers with high ticket counts may have all Stage 2 carriers reject them. This is acceptable — they've already seen the matches at Stage 1 and chosen to pursue. Debbie should communicate honestly if all per-carrier filters fail.

### 4.7 `accidents_3yr_count` and `accidents_3yr_at_fault_count` and `accidents_3yr_text`

- **Type:** two integers + free string
- **Source:** Stage 2, Q7
- **Acceptable user inputs:** Numeric, descriptive ("one not at fault"), or text ("one DOT-recordable, not at fault — guy rear-ended me at a light")
- **Validation:** Both counts non-negative integers. `at_fault_count` must be less than or equal to total `count`.
- **Matching behavior (hard-filter, per carrier):** Carriers define rules for total accident count, at-fault accident count, or both. Both numbers checked against the relevant rule.

### 4.8 `criminal_history` and `criminal_history_text`

- **Type:** boolean + free string
- **Source:** Stage 2, Q8
- **Acceptable user inputs:** Yes/no for boolean; free text if yes
- **Validation:** If `criminal_history` is true, `criminal_history_text` should be non-empty (Debbie soft-prompts but does not force).
- **Matching behavior (hard-filter, per carrier):** Carrier's rule defines whether they accept drivers with criminal history at all, and if so, what categories. Categorization of the free text (felony vs misdemeanor, violent vs non-violent, time elapsed, etc.) is out of scope for v1 matching — v1 treats `criminal_history = true` as a single category, and only carriers explicitly accepting any criminal history match. Refinement is a v2 question.

---

## 5. Hard-filter vs soft-rank summary

### 5.1 Hard-filter fields (binary include/exclude)

These fields, when failing a carrier's rule, exclude that carrier from the driver's match list:

- `driver_zip` (must be in carrier's hiring region)
- `experience_months` (must meet minimum)
- `schedule_preference` (must align with carrier position type)
- `termination_status = terminated_cause_based` (only carriers accepting cause-based terminations match)
- `sap_status = true` (only carriers accepting SAP drivers match)
- `tickets_3yr_count` (must be at or below carrier max)
- `accidents_3yr_count` and `accidents_3yr_at_fault_count` (must be at or below carrier maxes)
- `criminal_history = true` (only carriers accepting any criminal history match)

### 5.2 Soft-rank fields (affect order but not inclusion)

No soft-rank fields are specified in v1. All driver-supplied data is hard-filter. Soft-rank is reserved for future fields like:

- Specific equipment experience matching the carrier's primary equipment
- Endorsements held matching the carrier's preferred endorsements
- Years of experience above the carrier's minimum (more experience ranks higher)
- Driver's stated freight preference matching the carrier's freight mix

These are out of scope for v1 because they require data not collected at Stage 1. Adding them is a clear v2 enhancement once intake completion data shows the v1 set is sufficient for initial launch.

### 5.3 Default ranking when no soft-rank fields exist

In v1, all matched carriers receive equal soft-rank scores. Match list order is determined by:

1. Tier 1 subscription carriers first (during their 24-hour exclusivity window)
2. PHTP partner carriers and Tier 2 subscription carriers, ordered by carrier-side score (TBD in Core Technical Spec)
3. Prospect carriers (from FMCSA seed), ordered by recency of public job post

This ordering is implementation detail and belongs in the Core Technical Spec, not in this field schema spec.

---

## 6. Validation and error handling

### 6.1 Required field handling

If a required Stage 1 field is missing when the matching engine is called, the engine returns an error rather than producing partial matches. The intake orchestrator (Debbie or form fallback) is responsible for ensuring all required fields are collected before invoking matching.

### 6.2 Out-of-range values

Values outside reasonable bounds are flagged but not blocking:

- `experience_months` > 600: confirm with driver before accepting
- `tickets_3yr_count` > 20: confirm with driver before accepting (likely a transcription error)
- `accidents_3yr_count` > 10: confirm with driver before accepting

These confirmations are handled at the intake layer (Debbie's confirmation step per intake spec §4.3), not at the matching engine layer.

### 6.3 Free-text field length limits

Free-text fields (`termination_reason_text`, `tickets_3yr_text`, `accidents_3yr_text`, `criminal_history_text`) are capped at 500 characters per field. Drivers exceeding this are gently asked to summarize. The cap exists to prevent abuse and to keep the prequalification record manageable for carrier review.

### 6.4 Transcription errors

When the intake source is `chat_with_voice`, transcription errors may produce out-of-range or implausible values. The confirmation step in intake §4.3 catches most of these. If a value remains implausible after confirmation, the matching engine logs it for monitoring but still runs.

---

## 7. Carrier rules database schema (referenced, not specified here)

The matching engine consumes driver fields (this schema) and matches them against carrier rules. The carrier rules database stores each carrier's rules in a format consistent with this schema's field keys.

Each carrier rule references one of this schema's hard-filter fields and specifies the acceptable values or range. Examples:

- `driver_zip`: list of accepted state codes or zip-range tuples
- `experience_months`: minimum integer
- `schedule_preference`: list of position types the carrier hires for
- `termination_status`: list of accepted termination statuses
- `sap_status`: boolean (accepts SAP drivers true/false)
- `tickets_3yr_count`: maximum integer
- `accidents_3yr_count`: maximum integer (and optional separate max for at-fault)
- `criminal_history`: boolean (accepts any criminal history true/false)

The carrier rules database itself is specified separately in `DATA_partner-carriers-rules.xlsx` (currently STUB) and in the Core Technical Spec. This document defines the field keys the rules database must reference; it does not define the rules database structure.

---

## 8. Open questions

### 8.1 Termination-for-cause hard-filter and FCRA

The decision to hard-filter on `termination_status = terminated_cause_based` excludes the driver from matches with carriers that don't accept cause-based terminations. Per attorney brief addendum Question 5, this may or may not constitute adverse action under FCRA. If the attorney determines this is adverse action, the matching behavior must change to "show all matches with a disclosed pre-screen flag" rather than filter. **Pending attorney guidance.**

### 8.2 Criminal history v1 simplification

V1 treats `criminal_history = true` as a single category. Real carrier rules differentiate by felony vs misdemeanor, violent vs non-violent, time elapsed, drug-related vs other, etc. V1 will under-match drivers with old or minor criminal history because they'll only see carriers accepting "any" criminal history. **V2 enhancement: structured categorization of criminal history with carrier-side rule refinement.**

### 8.3 Endorsements at Stage 1

Currently excluded from Stage 1 to keep intake short. Endorsements (Hazmat, Tanker, Doubles/Triples, TWIC) are hard-filters for some carrier positions. A driver without Hazmat will not qualify for Hazmat-required positions and will see those carriers in their match list when they shouldn't.

**Options:**
- Leave excluded; carriers with endorsement requirements filter at their own application
- Add to Stage 1 as a multi-select question
- Add as a Stage 1.5 "are any of these endorsements you have?" follow-up after the five required fields

**Recommendation:** measure post-launch. If drivers without endorsements complain about wasted Stage 2 attempts on endorsement-required carriers, add to Stage 1.

### 8.4 Specific equipment experience

Same issue as endorsements. Total tractor-trailer experience is captured, but specific equipment (reefer, flatbed, tanker, auto-hauler, hazmat) is not. Carriers care about equipment-specific experience.

**Recommendation:** add as soft-rank fields in v2 — driver self-reports years on each equipment type, matching engine uses these to rank carriers higher when equipment matches.

### 8.5 Resume parsing data flow

When a driver uploads a resume at Stage 1, the parser may extract data that overlaps with this schema (experience, endorsements, equipment, prior employers). The intake spec §7.2 specifies that the driver confirms each extracted field before it's used. The field schema is unchanged — extracted data populates the same fields that Debbie's conversational extraction would populate.

**Open implementation question:** are resume-extracted fields tagged with their source (`source: resume_parsed`) for audit and accuracy tracking? Recommend yes; specify in Core Technical Spec.

### 8.6 Form fallback parity

The 6-step form fallback must collect the same fields as Debbie's conversational intake, with the same validation rules, the same enum values, and the same consent at the same point. The form fallback spec (currently STUB) must be updated to reference this field schema as authoritative.

---

## 9. What this document does not cover

- Database schema (column types, indexes, foreign keys) — in Core Technical Spec
- Carrier rules database structure — in Core Technical Spec and `DATA_partner-carriers-rules.xlsx`
- Matching engine performance, caching, async behavior — in Core Technical Spec
- LLM extraction prompts and confidence thresholds — in Conversation Orchestrator spec (separate document, not yet drafted)
- Consent language and storage — in Attorney Brief and Privacy Policy
- Nurture state machine — in Driver Nurture Sequence spec
- Email/SMS field collection (subscribed channels, opt-out state) — handled separately by nurture system

---

## 10. Change log

| Date | Change | By |
|------|--------|-----|
| 2026-05-19 | v1 created | Todd + Claude |

---

*End of spec.*
