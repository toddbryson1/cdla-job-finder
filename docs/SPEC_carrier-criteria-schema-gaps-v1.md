# Carrier Criteria Schema Gaps — CDLA.jobs

**Version:** 1.0
**Status:** DRAFT — Reference document, not a locked spec
**Audience:** Engineering, product, Todd
**Owner:** Todd Bryson
**Companion documents:** Matching Engine Field Schema v2.1, Carrier Jobs Database Schema v2, Matching Engine Build Session Prompt v2

---

## 1. Purpose

This document captures **all carrier hiring criteria and operational characteristics that the v2 schema cannot represent**, discovered during the manual ingestion of C.R. England's job catalog (41 jobs, 185 rows).

It is **not** a proposal to change the v2 schema. The v2 schema is locked and the matching engine is built against it. This document is intended as:

1. Input to a future v2.2 / v3 schema design session
2. A reference for the monthly carrier-data review process
3. A record of where matching may over-match or under-match drivers, so display-layer warnings or driver-facing description text can compensate

Each gap is recorded with:
- What the gap is
- How it was discovered (which job, which carrier)
- The current workaround
- The matching consequence (who is over-matched or under-matched)
- A proposed schema change, where feasible

---

## 2. Driver eligibility gaps

These are real carrier hiring criteria that the matching engine cannot enforce. The current workaround for all of them is to capture the requirement in the job's `description` field and let drivers self-select.

### 2.1 Per-job minimum age

**Discovered in:** Job #88 (OTR Mentor, C.R. England).

**Carrier rule:** "All mentors will need to be 25 years of age or older."

**Schema gap:** The matching field schema has no per-job minimum age field. The driver intake captures age implicitly (via the under-23 ticket logic referenced in C.R. England's company-wide guidelines), but the matching engine does not consume it.

**Workaround:** Age 25 requirement captured in description and `display_benefits_summary` for Job #88. Drivers self-select.

**Matching consequence:** Drivers aged 21-24 with 6+ months experience match Job #88 even though C.R. England will reject them at application time.

**Proposed schema change:** Add `min_driver_age` (integer, nullable) to `carrier_jobs`. Driver intake adds `birth_date` or `age_band` field. Engine enforces.

### 2.2 Conditional endorsement requirements

**Discovered in:** Jobs #13 (Sysco) and #933 (Sysco Mentor).

**Carrier rule:** "Driver will need to get a Hazmat within 90 days of hire."

**Schema gap:** `required_endorsements` is binary — either the driver must have the endorsement at application time, or it's not required. There is no "must obtain within X days of hire" tier.

**Workaround:** Hazmat NOT placed in `required_endorsements`. Captured in description. Drivers without hazmat still match, and decide whether they want to obtain it.

**Matching consequence:** Drivers with strong aversion to hazmat freight match these Sysco jobs and may waste time pursuing them.

**Proposed schema change:** Add `endorsements_required_within_days` (jsonb mapping endorsement → days). Driver intake adds `willing_to_obtain_endorsements` (array). Engine treats endorsement as conditionally required.

### 2.3 US citizenship / work authorization requirement

**Discovered in:** C.R. England company-wide hiring guidelines (Dec 2018 document).

**Carrier rule:** "Applicants must be US citizens" OR "Valid Permanent Residents or Work Authorization Card."

**Schema gap:** No driver field captures citizenship/work authorization status. Carriers cannot filter on it.

**Workaround:** Captured in `notes` per-row.

**Matching consequence:** Drivers without US work authorization match all C.R. England jobs and will be rejected at application.

**Proposed schema change:** Add `requires_us_work_authorization` (boolean) to `carrier_jobs`. Add `work_authorization_status` enum (`us_citizen`, `permanent_resident`, `work_visa`, `other`) to driver intake.

### 2.4 License suspension recency

**Discovered in:** C.R. England company-wide hiring guidelines.

**Carrier rule:** "No suspension in the past 12-months related to moving violations."

**Schema gap:** No driver field captures recent license suspensions. The Stage 2 safety fields (tickets, accidents, DUI, felony) do not include suspension history.

**Workaround:** Captured in `notes`.

**Matching consequence:** Drivers with recent suspensions match jobs they will be rejected for.

**Proposed schema change:** Add `license_suspended_in_last_12_months` (boolean) to Stage 2 driver intake. Add `accepts_recent_suspension` (boolean, default false) to `carrier_jobs`.

### 2.5 Drivers under 23 — stricter violation rules

**Discovered in:** C.R. England company-wide hiring guidelines.

**Carrier rule:** "Applicants under 23 years old: cannot have more than one moving violation within the past 12 months. No more than 2 in the past 3 years."

**Schema gap:** Violation thresholds are global per-job, not age-tiered.

**Workaround:** Captured in `notes`.

**Matching consequence:** Drivers under 23 with 2-3 tickets match jobs they will be rejected for.

**Proposed schema change:** Add age-tiered violation thresholds: `max_tickets_3yr_under_23`, `max_tickets_12mo_under_23`, etc. Engine applies the right threshold based on driver age.

### 2.6 CDL-position drug screen failure = lifetime disqualifier

**Discovered in:** C.R. England company-wide hiring guidelines.

**Carrier rule:** "A failed drug or alcohol screen with past employers where a CDL was required is never eligible for hire."

**Schema gap:** `sap_tolerance` enum has three values (`accepts_none`, `accepts_completed_only`, `accepts_all`) but does not distinguish CDL-position failures from non-CDL-position failures. The current C.R. England setting is `accepts_completed_only`, which is too permissive — CDL-position failures are lifetime bans regardless of SAP completion.

**Workaround:** Captured in `notes`. Drivers with CDL-position drug failures match incorrectly.

**Matching consequence:** Drivers with CDL-position drug failures match C.R. England jobs and will be permanently rejected.

**Proposed schema change:** Replace `sap_tolerance` with two fields: `sap_tolerance_cdl_position` and `sap_tolerance_non_cdl_position`. Or add `accepts_cdl_position_drug_failure` (boolean).

### 2.7 DUI lifetime cap and CMV-DUI ban

**Discovered in:** C.R. England company-wide hiring guidelines.

**Carrier rules:**
- "No more than 2 DUIs in a lifetime"
- "If 2 DUIs or open containers, the first one must be over 10 years old"
- "No DUI in a Commercial Motor Vehicle [ever]"

**Schema gap:** `accepts_dui` + `dui_max_recency_months` captures a single most-recent DUI age threshold. It does not capture lifetime DUI count, the gap-between-DUIs rule, or the CMV-DUI lifetime ban.

**Workaround:** Captured in `notes`.

**Matching consequence:** Drivers with 2+ lifetime DUIs (some old, some recent) or any CMV-DUI match C.R. England jobs and will be rejected.

**Proposed schema change:** Add `max_lifetime_duis` (integer), `first_dui_min_age_months_if_two` (integer), `accepts_cmv_dui` (boolean, default false). Driver Stage 2 adds `dui_count_lifetime` (integer) and `dui_in_cmv` (boolean).

### 2.8 Reckless driving 5-year ban

**Discovered in:** C.R. England company-wide hiring guidelines.

**Carrier rule:** "No reckless driving violations in the last 5 years."

**Schema gap:** No driver field captures reckless driving history specifically (separate from general moving violations). The Stage 2 safety fields lump reckless in with `tickets_3yr_count`.

**Workaround:** Captured in `notes`.

**Matching consequence:** Drivers with reckless driving history in the 3-5 year window match jobs they will be rejected for.

**Proposed schema change:** Add `reckless_driving_in_last_5yr` (boolean) to Stage 2 driver intake. Add `accepts_reckless_5yr` (boolean) to `carrier_jobs`.

### 2.9 Major preventable accident with fatality = permanent ban

**Discovered in:** C.R. England company-wide hiring guidelines.

**Carrier rule:** "Applicants with a preventable accident resulting in a fatality can never be hired."

**Schema gap:** Accident fields are count-based (`accidents_3yr_count`, `accidents_3yr_at_fault_count`). They do not capture fatality history.

**Workaround:** Captured in `notes`.

**Matching consequence:** Drivers with a lifetime fatality history match jobs and will be permanently rejected.

**Proposed schema change:** Add `preventable_fatality_ever` (boolean) to Stage 2 driver intake. Add `accepts_preventable_fatality` (boolean, default false) to `carrier_jobs`.

### 2.10 Termination rule semantic mismatch

**Discovered in:** C.R. England company-wide hiring guidelines.

**Carrier rule:** "Drivers termed from the last 2 CDL (Class A or B) driving jobs are not eligible."

**Schema gap:** Driver Stage 1 field is `terminated_from_any_of_last_3_employers` (boolean). C.R. England's rule is about the last 2, not last 3, and only CDL jobs, not any job.

**Workaround:** Using `accepts_terminated = false` (the conservative default). Captured in `notes`.

**Matching consequence:** Possible false negatives — drivers terminated 3 employers ago may not match even though C.R. England would accept them. Possible false positives if non-CDL terminations affect the driver's flag.

**Proposed schema change:** Replace single boolean with `recent_terminations_count` and `recent_termination_lookback_jobs` per job, AND distinguish CDL vs non-CDL terminations in driver intake.

### 2.11 Felony recency tier missing

**Discovered in:** Jobs #6 (Autoliv) and others.

**Carrier rule (C.R. England Cat B felony):** "Felony must be 7 years old from the date of conviction."

**Schema gap:** `accepts_felony` is a boolean. There is no `felony_max_recency_months` analogous to `dui_max_recency_months`. Carriers either accept all felonies or none.

**Workaround:** Setting `accepts_felony = true` (per Todd's decision). Schema gap captured in `notes`. The 7-year requirement is enforced only at carrier review.

**Matching consequence:** Drivers with recent felonies match C.R. England jobs and will be rejected.

**Proposed schema change:** Add `felony_min_recency_months` (integer, nullable). C.R. England would be 84 months (7 years) for Category B/C felonies. The schema would also need to distinguish felony categories (Cat A = lifetime ban, Cat B/C = 7 years, Cat D = no restriction) for full accuracy.

---

## 3. Job operational characteristic gaps

These are characteristics of jobs that affect driver fit but are not currently captured.

### 3.1 Touch vs no-touch freight preference

**Discovered in:** Jobs #371, #882, #932, #338, #341, #374, #921 (and many others).

**Carrier reality:** Some jobs require physical unloading (rollers, electric pallet jack, lift gate, roto-cart, hand-unload). Others are no-touch (drop-and-hook, live load/unload by warehouse staff).

**Driver preference:** Some drivers refuse touch freight due to physical demands, age, or back/joint issues. Others actively prefer it ("active driving experience").

**Schema gap:** No driver preference field for touch tolerance. No job-side field for touch intensity.

**Workaround:** Touch-freight nature noted in job descriptions. Drivers read and self-select.

**Matching consequence:** A driver wanting no-touch freight matches touch-freight jobs and may waste time pursuing them.

**Proposed schema change:** Add `freight_handling` enum (`no_touch`, `light_touch_drop_hook`, `unload_rollers`, `unload_pallet_jack`, `unload_lift_gate`, `mixed`) to `carrier_jobs`. Add `accepts_touch_freight` (boolean) to driver intake.

### 3.2 Mixed touch/no-touch within a single job

**Discovered in:** Jobs #590 (outbound touch, backhaul no-touch), #921 (occasional unloading).

**Schema gap:** Same as 3.1, plus the case where a single job has both modes.

**Proposed schema change:** Use a `freight_handling = mixed` value with detail in description, or model touch percentage (e.g., `touch_freight_percent_of_loads`).

### 3.3 Hourly vs CPM pay structure

**Discovered in:** Job #338 (Dollar Tree Ridgefield — hourly, tiered by tenure).

**Carrier reality:** Some jobs pay hourly, not per-mile. This changes the economics significantly for drivers who can wait through detention/dock time vs. those who can't.

**Schema gap:** Pay fields are weekly $ amounts only (`pay_range_max_weekly_usd`). No explicit pay structure type.

**Workaround:** Hourly detail captured in `display_benefits_summary`.

**Matching consequence:** Drivers who specifically prefer one pay structure can't filter.

**Proposed schema change:** Add `pay_structure` enum (`cpm`, `hourly`, `salary`, `mixed`, `per_load`, `ring_zone`) to `carrier_jobs`. Still display weekly equivalent for comparison.

### 3.4 Tiered pay by experience tenure

**Discovered in:** Job #338 ($29-30.50/hr for 0-48 months, $31/hr for 49-200 months); Job #208 ("Band Rates based on Experience").

**Schema gap:** Pay range is a single min/max per job. No way to express "less experienced drivers earn X, more experienced earn Y."

**Workaround:** Captured in `display_benefits_summary`.

**Proposed schema change:** Add `pay_tier_structure` jsonb with experience-band → pay-rate mapping.

### 3.5 Percentage-based performance bonuses

**Discovered in:** Multiple jobs (#361, #328, #921, #498, #921, #88) with "Safe & On-Time Bonus — up to 3% of mileage pay."

**Schema gap:** Bonus structure not modeled. Display only shows weekly range, which may or may not include bonuses.

**Workaround:** Captured in `display_benefits_summary`.

**Proposed schema change:** Add `bonus_structure` jsonb to `carrier_jobs` capturing bonus types, max amounts, and conditions.

### 3.6 Ring pay (zone-based pay by distance from DC)

**Discovered in:** Jobs #335 (Smithfield Arnold) and #453 (Smithfield Regional FL).

**Definition:** Each distance from the distribution center pays a predetermined amount via concentric circles. Layered on top of mileage pay.

**Schema gap:** No way to model zone-based pay structure.

**Workaround:** Captured in `display_benefits_summary`.

**Proposed schema change:** Part of the general pay structure proposal in 3.3.

### 3.7 Mileage-threshold pay structure

**Discovered in:** Job #386 ("Per-load pay for runs up to 189 miles, CPM after").

**Schema gap:** Pay structure with conditional rates based on distance thresholds is not modeled.

**Workaround:** Captured in `display_benefits_summary`.

**Proposed schema change:** Part of the general pay structure proposal in 3.3.

### 3.8 Personal vehicle / commute requirement

**Discovered in:** Jobs #374, #921, #208, #335, #386, #453, #498 (and others).

**Carrier reality:** Some jobs require the driver to leave the truck at the carrier's facility and commute to/from work in their own vehicle. Drivers without reliable personal transportation cannot do these jobs.

**Schema gap:** No field captures truck-stays-on-site policy or personal-vehicle requirement.

**Workaround:** Captured in `notes` and `display_benefits_summary`.

**Matching consequence:** Drivers without personal transportation may match jobs they can't perform.

**Proposed schema change:** Add `truck_take_home_policy` enum (`allowed`, `if_safe_secure`, `terminal_only`) and `requires_personal_vehicle_commute` (boolean) to `carrier_jobs`.

### 3.9 Operational-hub distance rule (parking constraint by driver home)

**Discovered in:** Job #338 ("Drivers must have a safe authorized place to park the truck if they live more than 50 miles away from Ridgefield, WA"). Also Job #85 ("Truck parking at CRE facility if within 100 miles of home address").

**Carrier reality:** Truck-parking eligibility is tied to driver's distance from a specific operational hub, which may differ from the listed hiring domiciles.

**Schema gap:** The hiring radius and truck-parking radius are conflated in v2's `hiring_radius_miles`. No separate field for operational-hub distance.

**Workaround:** Captured in `notes` and description.

**Proposed schema change:** Add `truck_parking_hub_lat`, `truck_parking_hub_lng`, `truck_parking_hub_max_distance` to `carrier_jobs` (nullable).

### 3.10 Shift timing — overnight / day / evening

**Discovered in:** Jobs #911 (24/7 ops), #374 (7-9 PM start), #921 (overnight required), #498 (night driving), #386 (3-11 PM start).

**Driver reality:** Some drivers physically cannot or will not work overnight shifts. Others actively prefer them.

**Schema gap:** Home-time enum (`daily`, `weekly`, `biweekly`, `otr`) does not capture when during the day a driver works. A "home daily" 7am-5pm job and a "home daily" 9pm-9am job are very different lifestyle fits.

**Workaround:** Captured in `display_home_time_description`.

**Matching consequence:** Drivers expecting daytime work match overnight jobs.

**Proposed schema change:** Add `shift_pattern` enum (`day`, `night`, `evening`, `variable`, `rotating`) to `carrier_jobs`. Add driver preference field.

### 3.11 Schedule predictability

**Discovered in:** Jobs #911, #917, #335, #921, #498 ("days off vary based on freight demands," "no set schedules," "no specific start time").

**Driver reality:** Some drivers need predictable schedules for childcare, second jobs, medical appointments, etc. Others don't care.

**Schema gap:** No predictability field.

**Workaround:** Captured in description.

**Proposed schema change:** Add `schedule_predictability` enum (`fixed`, `mostly_fixed`, `variable`) to `carrier_jobs`.

### 3.12 Mandatory weekend / holiday work

**Discovered in:** Jobs #386 ("weekends and all holidays"), #453 ("weekends, holidays, and overnight"), #911 ("weekend work"), #374 ("5-day work week including weekends").

**Driver reality:** Religious observance, family obligations, sports/hobby weekends.

**Schema gap:** Not modeled.

**Workaround:** Captured in description.

**Proposed schema change:** Add `weekend_work` enum (`never`, `rotating`, `always`) and `holiday_work_required` (boolean) to `carrier_jobs`. Driver intake adds optional preference fields.

---

## 4. Equipment and home-time enum gaps

### 4.1 Mixed-equipment jobs

**Discovered in:** Jobs #929 (Walmart Baltimore — dry van AND reefer) and all OTR jobs (#897, #888, #894, #887, #908, #918, #883, #889, #886, #895, #899, #893, #898, #896, #892, #890, #88, #885 — "mostly reefer with some dry van").

**Schema gap:** `equipment` is a single enum per row. Cannot represent a job that genuinely runs both equipment types.

**Workaround:** Split into two rows per equipment variant (one for dry-van, one for reefer). The matching engine returns both rows to drivers who match both.

**Matching consequence:**
- Drivers who match only one equipment type see the job once (correct)
- Drivers who match both equipment types see the same job twice with different equipment fields (potential UI deduplication concern)

**Proposed schema change:** Convert `equipment` to `equipment_types` (array of enum values). Engine treats any equipment in the array as a valid match.

### 4.2 Semi-local home time

**Discovered in:** Job #917 (Kroger Denver Regional — "through the house every other day").

**Industry context (per Todd):** "Every other day" is a semi-local pattern — distinct from daily, weekly, biweekly, or OTR.

**Schema gap:** Home-time enum (`daily`, `weekly`, `biweekly`, `otr`) does not include `semi_local`.

**Workaround:** Job #917 left at `weekly` per Todd's call; nuance captured in `display_home_time_description`.

**Matching consequence:** Drivers specifically wanting semi-local lifestyle don't find these jobs cleanly. Drivers picking "daily" or "weekly" who match these jobs may be surprised by the actual pattern.

**Proposed schema change:** Add `semi_local` to home-time enum. Driver intake adds it as a choice. Engine recognizes it.

### 4.3 Hybrid local + OTR within a single job

**Discovered in:** Job #386 (Smithfield Hybrid NC — "12-hour local shifts AND weekly OTR runs 2-3 times per week").

**Schema gap:** A single driver on this job alternates between local and OTR patterns within the same week. No enum captures this.

**Workaround:** `accepted_home_time_types = ["daily", "weekly"]` (multi-value) per Todd's call. Catches both audiences.

**Matching consequence:** Drivers expecting pure-local or pure-OTR may be surprised.

**Proposed schema change:** Add `hybrid_local_otr` to home-time enum. Or accept multi-value as the current convention.

### 4.4 OTR with hiring radius

**Discovered in:** All C.R. England OTR jobs (#897 Phoenix 200mi, #908 Atlanta 100mi, etc.).

**Schema convention:** Per Field Schema v2.1, OTR jobs should have `hiring_radius_miles = NULL` (national hire).

**Carrier reality:** C.R. England's OTR jobs are anchored to specific terminals (Phoenix, Atlanta, Dallas, etc.) with explicit hiring radii.

**Resolution:** Not strictly a schema gap — the schema supports OTR with a radius. But it's an idiom worth documenting: OTR doesn't always mean "hire from anywhere."

**Action required:** None on the schema. Update the matching engine documentation to clarify that `accepted_home_time_types = ["otr"]` does not imply NULL radius.

---

## 5. Data quality and operational gaps

### 5.1 Source data vs prose description conflicts

**Discovered in:** Job #16 (Christopher Ranch — listed Colton only, description said Colton OR Gilroy), Job #335 (Smithfield Arnold — listed Tar Heel only, description said Tar Heel OR Arnold PA), Job #917 (Kroger Regional — labeled "Home Weekly" but description was "every other day"), Job #85 (Schreiber Teams — labeled "Home Weekly" but description was "3-4 weeks out").

**Schema gap:** No precedence rule for resolving conflicts between a carrier's structured fields and their prose description.

**Workaround:** Case-by-case judgment with a magnitude-of-mismatch heuristic: small mismatches trust the structured field, large mismatches trust the description.

**Proposed action:** Document the precedence rule in the monthly ingestion process. Possibly add `data_conflict_flag` boolean to `carrier_jobs` to surface jobs that needed manual reconciliation.

### 5.2 Whole-state hiring zones

**Discovered in:** Job #361 (`6143 - MO`), Job #85 (`5865 - UT`), Job #888 (`5516 - AR`), Job #883 (`5510 - IN`), Job #889 (`5517 - IA`), Job #885 (`5512 - MO`), Job #893 (`5951 - OK`), Job #88 (6 whole-states).

**Schema gap:** v2's point + radius model doesn't natively support whole-state hiring zones.

**Workaround (Option B, current convention):** Use state center coordinates + 250mi radius + `accepted_cdl_states = [<state>]` as guardrail.

**Matching consequence:** A driver residing in the state but holding an out-of-state CDL will not match. Estimated impact: small (most drivers' CDL state matches their residence state), but real.

**Proposed schema change:** Add `accepts_whole_state` enum or array to `carrier_jobs`. Engine treats this as "any driver whose `home_state` is in the array matches the geospatial filter."

### 5.3 Per-domicile policy variation within a single job

**Discovered in:** Job #328 (Las Vegas drivers run biweekly while other domiciles run weekly), Job #13 (Front Royal VA drivers home weekly while other 16 domiciles run weekly/biweekly).

**Schema reality:** The v2 schema supports this naturally — each row is independent. But operationally, the **carrier thinks of these as one job**. When C.R. England updates the policy, all rows need synchronized updates.

**Operational gap, not schema gap.** Worth flagging in the monthly review process: variants of a single source-job must be updated together.

**Proposed schema change:** Optional — add `parent_job_external_id` (the carrier's job ID) to link rows that derive from the same source.

### 5.4 Stale carrier data

**Discovered in:** Jobs #897, #918, #888, #899, #886, #892, #890, #885 — last carrier update 2025-09-24 (8+ months stale). Job #883 — last update 2025-10-09 (7+ months).

**Schema reality:** v2 has `verification_status` enum (`verified`, `stale`, `unverified`) and `last_verified_at` datetime. Stale data IS captured.

**Operational gap:** The monthly review process needs an explicit step to either re-verify stale jobs against the carrier's source data or escalate.

**Proposed action:** Build a review queue that filters `verification_status != verified` jobs and presents them for re-verification.

### 5.5 Bad source data — sentinel values

**Discovered in:** Job #13 (`Top Weekly: $0`), Job #933 (`Top Weekly: $0`).

**Cause:** Carrier's source system has fields that may be blank, null, or zero-defaulted when not populated.

**Operational gap:** No validation rule flags "pay_top = 0 with annual pay > 0" as suspect.

**Proposed action:** Add basic data quality checks at import time: zero values where non-zero is expected, NULL where required, sanity-check ratios (e.g., annual / 52 ≈ weekly).

### 5.6 Carrier-claimed equipment age inconsistencies

**Discovered in:** Job #897 OTR description says "3 years old or newer" while Todd's company-wide instruction for dedicated accounts is "2 years or newer."

**Operational gap:** Equipment claims vary between dedicated and OTR fleets within the same carrier.

**Workaround:** Standing assumption now caveated by fleet type (dedicated 2yr+, OTR 3yr+).

**Proposed schema change:** Add `truck_max_age_years` (integer) to `carrier_jobs` for explicit display.

### 5.7 Mentor pay benchmark conflict

**Discovered in:** Job #933 (Sysco Mentor) showed identical pay to non-mentor Job #13 ($1,550-$2,077). Job #88 (OTR Mentor) shows clear mentor premium ($1,746-$2,234 vs solo OTR $1,202-$1,512).

**Conclusion:** Job #933's pay data appears suspect. Mentors typically earn a meaningful premium over non-mentor positions.

**Action taken:** Job #933 retroactively flagged with mentor-pay verification note.

**Proposed action:** Verify with C.R. England whether Sysco Mentor pay is genuinely identical to non-mentor or whether the source data is wrong.

### 5.8 Job-family variant relationships

**Discovered in:** Job #13 (Sysco) and Job #933 (Sysco Mentor) — same lane, same customer, different driver type. Job #911 (Kroger Local) and Job #917 (Kroger Regional) — same customer, different operational structure.

**Schema gap:** No relationship between sibling jobs. Each is independent.

**Operational gap:** When the carrier updates the underlying lane structure, both jobs need separate updates.

**Proposed schema change:** Optional `related_jobs` array of `carrier_jobs.id` for cross-reference.

### 5.9 New-grad vs experienced driver distinction

**Discovered in:** Job #895 OTR Nevada (Experience = 0 — accepts new graduates), all other OTR jobs (Experience = 3 minimum), Job #88 OTR Mentor (Experience = 6 minimum).

**Schema reality:** `min_experience_months` captures this.

**Display consequence:** Drivers benefit from explicit "new grad friendly" or "experienced drivers only" labeling on match cards. Schema supports the data; display layer can derive the label.

**Proposed action:** Add a derived field or display rule in the match card UI for `min_experience_months = 0` → "New CDL grads welcome".

---

## 6. Summary table — proposed schema changes by priority

Categorized by matching consequence severity.

### 6.1 High priority — current schema causes false matches that will be rejected

| Gap | Proposed change |
|-----|-----------------|
| 2.6 CDL-position drug screen lifetime ban | Split `sap_tolerance` by position type |
| 2.7 DUI lifetime cap + CMV-DUI ban | Add lifetime DUI count + CMV-DUI flag |
| 2.9 Preventable fatality lifetime ban | Add fatality fields |
| 2.11 Felony recency tier | Add `felony_min_recency_months` |
| 2.3 US work authorization | Add citizenship/work auth field |

### 6.2 Medium priority — improves match quality, reduces driver friction

| Gap | Proposed change |
|-----|-----------------|
| 2.1 Per-job minimum age | Add `min_driver_age` |
| 2.4 License suspension recency | Add suspension fields |
| 2.5 Under-23 ticket rules | Add age-tiered violation thresholds |
| 2.8 Reckless driving 5yr | Add reckless field |
| 2.10 Termination rule semantic mismatch | Refine `accepts_terminated` semantics |
| 3.1 Touch vs no-touch freight | Add `freight_handling` enum |
| 3.8 Personal vehicle requirement | Add truck-take-home + commute fields |
| 4.1 Mixed-equipment jobs | Convert `equipment` to array |
| 4.2 Semi-local home time | Add `semi_local` to enum |

### 6.3 Lower priority — captured in display layer for now

| Gap | Proposed change |
|-----|-----------------|
| 2.2 Conditional endorsements | Add `endorsements_required_within_days` |
| 3.3-3.7 Pay structure variants | Add `pay_structure` enum + bonus jsonb |
| 3.9 Operational-hub distance | Add truck-parking hub fields |
| 3.10 Shift timing | Add `shift_pattern` enum |
| 3.11 Schedule predictability | Add predictability enum |
| 3.12 Weekend/holiday work | Add work-pattern fields |
| 4.3 Hybrid local+OTR | Add hybrid enum value or accept multi-value |
| 5.2 Whole-state zones | Add `accepts_whole_state` |
| 5.8 Job-family variants | Add `related_jobs` array |

---

## 7. What this document is NOT

- **Not a locked spec.** This is a reference document.
- **Not a commitment to implement.** Each proposed schema change is a candidate, not a roadmap item.
- **Not exhaustive of all possible gaps.** Future carriers may surface gaps not present in C.R. England's data.
- **Not a substitute for attorney review.** Some gaps (e.g., FCRA-adjacent fields like SAP, felony, DUI) need attorney guidance before schema changes are made.

---

## 8. Recommended next steps

1. **Review with engineering** — confirm which proposed changes are feasible without disrupting the built matching engine.
2. **Prioritize for v2.2 or v3** — pick 3-5 highest-priority gaps to address in the next schema bump.
3. **Update driver intake** — any new driver-side field requires updates to Conversational AI Intake v1 and Form Fallback v1.
4. **Update monthly review checklist** — incorporate stale-data flagging, sentinel-value detection, and source-vs-description conflict checks.
5. **Run this exercise for the next carrier** — when ingesting Swift, Werner, Schneider, etc., new gaps will surface. Append to this document.

---

## 9. Anderson Trucking Service additions (Sterling channel)

The Anderson Trucking Service ingestion (4 actively-hiring products through the Sterling Recruiting Solutions channel) surfaced the gaps below. Each is appended here per the appendix convention in §8 step 5. Items that strengthen or duplicate existing C.R. England gaps are cross-referenced rather than restated.

**Source:** ATS Driver Qualification Guidelines 03-23-2026, Pre-Qual Sheet, Driver Orientation Guidelines (verbatim Anderson docs); spec `docs/SPEC_anderson-application-handoff-addendum-v2.md` §B9.

### 9.1 Multi-path experience requirements

**Discovered in:** All 4 Anderson `carrier_jobs` rows (Lease Van OTR, Lease Van MW Regional, Company Flatbed, Lease Flatbed). Builds on a similar pattern noted during USX ingestion (2-path).

**Carrier rule:** Three accepted experience paths: (a) 6 months OTR in last 24 months; (b) 12 months OTR in last 36 months; (c) 18 months OTR/regional in last 60 months with local experience counting.

**Schema gap:** `min_experience_months` + `min_experience_months_window_months = 36` is a single (months, window) tuple. Cannot express three OR-ed paths, especially the third path's "local counts" relaxation.

**Workaround:** Set `min_experience_months = 6` (the most permissive Anderson-side floor). Drivers with 6mo OTR in 24mo match; drivers who qualify only via paths (b) or (c) also match — Sterling filters at qualification call.

**Matching consequence:** Drivers with 18mo OTR + local mix in 60mo are over-matched (good — Anderson does accept them, just via the third path). Drivers with 7mo OTR but the prior 18 months mostly local are over-matched (Sterling will filter).

**Proposed schema change:** Convert `min_experience_months` from scalar to `experience_paths` jsonb array, each element `{months, window_months, equipment_filter?, lane_filter?}`. Engine ORs paths; if any matches, driver passes.

### 9.2 Equipment-specific prior experience as a hard filter

**Discovered in:** Job #3 (Company Flatbed — Anderson).

**Carrier rule:** "Minimum 6 months FB experience (preferably with one company) within the last 2 years."

**Schema gap:** `min_otr_experience_months` is a single number, equipment-agnostic. Anderson's Company Flatbed requires *flatbed-specific* prior experience, not just OTR months.

**Workaround:** Set `min_otr_experience_months = 6` as a proxy and capture the flatbed-specific requirement in `notes` + `description`.

**Matching consequence:** Drivers with 6+ months OTR dry-van experience match Company Flatbed even though Anderson requires flatbed-specific months. Sterling filters.

**Proposed schema change:** Add `min_equipment_experience_months` jsonb (mapping `equipment_slug → months`). Engine reads the matching slug for the job's `equipment`.

### 9.3 Tiered tolerance by experience tenure

**Discovered in:** All 4 Anderson rows (Guidelines §C.6, §C.7).

**Carrier rule:** Different ticket / preventable-accident counts allowed depending on whether the driver has 4+ years experience or fewer. Anderson is pervasively two-tier across all violation rules.

**Schema gap:** `max_tickets_3yr` / `max_accidents_3yr` are single scalars. Cannot express "max 2 if <4yr; max 3 if 4+yr."

**Workaround:** Use the more permissive tier as the field value (`max_tickets_3yr = 3`, `max_accidents_3yr = 3`). Less-experienced drivers with 3 tickets are over-matched; Sterling filters.

**Matching consequence:** Newer drivers (<4yr) with 2–3 tickets over-match. Strengthens existing gap 2.5 (C.R. England's under-23 tier) — same shape, different threshold.

**Proposed schema change:** Convert ticket/accident maxes to `{tier1: {min_experience_months, max}, tier2: {...}}`. Engine selects tier based on driver's `years_held`.

### 9.4 Absolute critical-event bars (zero in 24 months)

**Discovered in:** Anderson Guidelines §C.9–§C.11.

**Carrier rule:** Zero critical-crash / roll-away / bridge-strike events in the past 24 months. Stacks ON TOP of the 3-year preventable-accident count.

**Schema gap:** No driver-side field captures these specific event types. The Stage 2 safety questions ask only for total accidents count + at-fault accidents count.

**Workaround:** Captured in description. Drivers with any of these events match and are filtered at Sterling.

**Matching consequence:** Drivers with a bridge strike inside 24 months over-match all Anderson jobs.

**Proposed schema change:** Add Stage 2 booleans: `critical_crash_24mo`, `roll_away_24mo`, `bridge_strike_24mo`. Carrier rule becomes `accepts_critical_event_24mo = false`.

### 9.5 PSP review reservation

**Discovered in:** All 4 Anderson rows (catch-all in Guidelines).

**Carrier rule:** "Anderson reserves the right to review based on PSP findings, prior terminations, job changes, and unemployment history."

**Schema gap:** No structured way to express "carrier reserves manual-review discretion beyond automated rules."

**Workaround:** Captured in description. Drivers see "Anderson reserves the right to review…" in the visible job copy.

**Matching consequence:** None on matching — PSP review only fires at Sterling's qualification call.

**Proposed schema change:** None recommended — this is inherent to recruiter-mediated handoffs. Display-layer disclosure is sufficient.

### 9.6 Termination rule semantic mismatch (Anderson variant)

**Discovered in:** All 4 Anderson rows (Guidelines §A.9).

**Carrier rule:** "Zero safety-related terminations within the past 12 months; No more than two terminations (safety or non-safety) within the past five years."

**Schema gap:** Same root gap as 2.10 (C.R. England). `accepts_terminated` is a single boolean — cannot express the conditional shape (zero safety in 12mo AND ≤2 total in 5yr).

**Workaround:** `accepts_terminated = true` and the conditional is captured in description.

**Matching consequence:** Cross-references 2.10. Anderson's variant adds the overlapping-windows + safety-vs-non-safety categorization. Strengthens the proposed change in 2.10.

**Proposed schema change:** Builds on 2.10. The refined `accepts_terminated` should be a jsonb `{recent_safety_months, recent_safety_max, total_window_years, total_max}`.

### 9.7 Job-change frequency limits

**Discovered in:** All 4 Anderson rows.

**Carrier rule:** ≤3 driving-job changes in the past 12 months, ≤5–6 in the past 36 months.

**Schema gap:** Driver intake does not capture job-history detail; matching engine has no equivalent rule.

**Workaround:** Captured in description.

**Matching consequence:** Job-hoppers match Anderson jobs they will be rejected for.

**Proposed schema change:** Add Stage 2 fields `driving_jobs_in_last_12mo`, `driving_jobs_in_last_36mo` (integer). Add `max_driving_jobs_12mo`, `max_driving_jobs_36mo` to `carrier_jobs`.

### 9.8 Unemployment gap limits

**Discovered in:** All 4 Anderson rows.

**Carrier rule:** ≤6 months unemployment in the past 12 months, ≤12 months in the past 36 months.

**Schema gap:** Driver intake does not capture employment-gap detail.

**Workaround:** Captured in description.

**Matching consequence:** Drivers returning from longer gaps over-match.

**Proposed schema change:** Add Stage 2 fields `unemployment_months_in_last_12mo`, `unemployment_months_in_last_36mo`. Add corresponding `max_*` fields to `carrier_jobs`.

### 9.9 Truck abandonment history

**Discovered in:** All 4 Anderson rows.

**Carrier rule:** Zero truck abandonments in last 36 months; ≤1 in last 7 years.

**Schema gap:** Driver intake has no abandonment field.

**Workaround:** Captured in description. Drivers self-select.

**Matching consequence:** Drivers with any abandonment match and are filtered at Sterling.

**Proposed schema change:** Add Stage 2 booleans `truck_abandoned_in_last_36mo`, `truck_abandonments_in_last_7yr` (integer). Add `max_abandonments_*` to carrier rules.

### 9.10 DUI / felony manual-review beyond 7 years

**Discovered in:** Anderson Guidelines §D.2 (DUI) and §D.8 (felony).

**Carrier rule:** Anderson generally requires zero DUI/felony in past 7 years; a single conviction *beyond* 7 years may be accepted with safety-review approval.

**Schema gap:** `accepts_dui` / `accepts_felony` are booleans. Cannot express "no within window, manual review beyond window." Strengthens existing 2.7 (DUI tier) and 2.11 (felony recency tier).

**Workaround:** `accepts_dui = false` and `accepts_felony = false` (matching-safe choice). Drivers with conviction >7yr ago are under-matched; spec calls this out explicitly as a manual-review path the schema can't express.

**Matching consequence:** Drivers with 8-year-old DUI under-match — Anderson might accept them but they don't see the job.

**Proposed schema change:** Convert `accepts_dui` / `accepts_felony` to enums: `auto_accept | manual_review | auto_reject`. Add `dui_manual_review_recency_months` / `felony_manual_review_recency_months`.

### 9.11 Absolute felony bars by category

**Discovered in:** Anderson Guidelines §D.5, §D.6.

**Carrier rule:** Lifetime bar on sex offenses; recent homicide (within 20 years) is an absolute bar regardless of other felony rules.

**Schema gap:** `accepts_felony` is a single boolean; no category-aware bars.

**Workaround:** None feasible in current schema — Anderson's policy treats sex offense as a strict lifetime exclusion that overrides all other felony tolerance.

**Matching consequence:** Drivers with lifetime-barred felony categories may match if `accepts_felony = true` and they self-attest "no felony in last 7 years." Display-layer disclosure helps but is not enforcement.

**Proposed schema change:** Add Stage 2 enum `felony_category_self_disclosed` (`none, violent_non_lifetime, sexual_offense, recent_homicide, other`). Add carrier-level `bars_felony_categories` array.

### 9.12 Irregular hiring polygons (vs. radius)

**Discovered in:** All 4 Anderson rows; Anderson publishes two PNG map images on drive4ats.com (National OTR + MW Regional). Builds on the gap already partially addressed by migration 0021 (PostGIS polygons).

**Carrier rule:** Anderson hires from inside two distinct irregular geographic shapes (one national-ish, one Upper-Midwest-ish), not from circles.

**Schema gap:** The schema added `hiring_polygon GEOGRAPHY(Polygon, 4326)` in 0021, but Anderson supplied no machine-readable polygons — only image maps. So the gap shifted from "schema cannot represent polygons" to "carrier-supplied polygon data is not available." Captured here because it is the same operational problem from the matching side.

**Workaround:** Single point + 1500mi (national products) or 500mi (MW Regional) radius. Generates known false positives on the periphery.

**Matching consequence:** Drivers in geographic corners that Anderson's actual maps exclude (PNW corner, Far Northeast) are over-matched. Sterling filters at qualification call.

**Proposed schema change:** Workflow — when ingesting partner carriers, capture polygons in KML / GeoJSON when available; ask carrier to provide a structured representation as part of partner onboarding. Schema is already polygon-ready.

### 9.13 Lease vs. company pay structure semantics

**Discovered in:** Anderson rows 1, 2, 4 (lease products) vs. row 3 (company driver).

**Carrier rule:** Lease products quote pay as **take-home after expenses**; company products quote **gross**. These are not directly comparable for driver shopping.

**Schema gap:** `pay_range_*_weekly_usd` is a single scalar with no distinction between gross and net.

**Workaround:** Captured per-row in `display_benefits_summary` ("take home $1,500–$2,200/wk after expenses"). Drivers self-interpret.

**Matching consequence:** None on matching; affects driver shopping experience when comparing lease vs. company carriers.

**Proposed schema change:** Add `pay_structure_type` enum (`gross_weekly`, `take_home_after_expenses`, `cpm`, `percentage`, `hourly`). Display layer renders accordingly.

### 9.14 Minimum age decoupled from minimum experience

**Discovered in:** Anderson Pre-Qual Sheet ("Minimum 21 years of age"). Same root gap as 2.1 (C.R. England Job #88 — minimum age 25 for mentor), now confirmed as pervasive across carriers.

**Carrier rule:** Anderson requires age 21 regardless of CDL tenure. (Most under-21 CDL holders are intrastate-only; this is industry-standard but still not enforced by the matching engine.)

**Schema gap:** Same as 2.1.

**Workaround:** Captured in description.

**Proposed schema change:** Same as 2.1. Promotion to required-fields tier — every carrier surfaces this.

### 9.15 Pay-range source conflicts requiring versioning

**Discovered in:** Anderson row 4 (Lease Flatbed) — Sterling's openings notes list $1,800–$3,000/wk; Sterling's 3/2026 pay update lists $1,500–$2,500/wk. Same product, two different sources.

**Schema gap:** No source-versioning on pay fields. Whichever value lands at last write wins.

**Workaround:** Used the conservative-display range ($1,500–$3,000 as the union envelope); flagged the conflict in `notes`; open question §B10 Q10 in the Anderson spec to resolve with Sterling.

**Matching consequence:** None on matching; affects driver expectations.

**Proposed schema change:** Add a `pay_source_history` jsonb to track date-stamped pay updates per row. Display layer surfaces the most recent.

---

## 10. Change log

| Date | Change | By |
|------|--------|-----|
| 2026-05-27 | v1.0 created from C.R. England manual ingestion (41 jobs, 185 rows) | Todd + Claude |
| 2026-06-01 | Anderson Trucking Service additions appended as §9 (15 new gaps + cross-refs to 2.1/2.5/2.7/2.10/2.11). Did not bump version — the doc is a living reference. | Todd + Claude |

---

*End of spec.*
