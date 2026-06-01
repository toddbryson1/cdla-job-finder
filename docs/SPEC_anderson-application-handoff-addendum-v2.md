# Anderson (ATS) Application Handoff & Carrier Jobs — Addendum

**Version:** 2.0 — supersedes v1 entirely
**Status:** DRAFT — for review
**Audience:** Internal — product, engineering, Todd
**Owner:** Todd Bryson
**Companion documents:** Carrier Jobs Database Schema v2, Swift Application Handoff Addendum v1, Attorney Brief Addendum v2, Stage 2 Build Session Prompt, Carrier Criteria Schema Gaps v1

**What changed from v1:**
- Scope narrowed from "all of Anderson" to **4 actively-hiring products** through the Sterling channel
- Full hiring criteria locked from Anderson's own qualification PDFs (Driver Qualification Guidelines 03-23-2026, Pre-Qual Sheet, Driver Orientation Guidelines)
- Multi-product modeling: 4 distinct `carrier_jobs` rows (Lease Van OTR, Lease Van MW Regional, Company Flatbed, Lease Flatbed)
- 9 new schema-gap items surfaced for inclusion in `SPEC_carrier-criteria-schema-gaps-v1.md`
- Pay, home time, and operational details from Sterling's openings notes (5/2026)
- Orientation details locked (Porter, IN for company; St. Cloud, MN for contractors)

---

## B1. Purpose and scope

This addendum specifies CDLA.jobs's application handoff for **Anderson Trucking Service ("ATS"; legal entity name to be verified, headquartered at 725 Opportunity Dr., St. Cloud, MN 56301, founded 1955)** through the **Sterling Recruiting Solutions** referral channel that PHTP partners with.

Anderson runs at least 8 distinct driver products across its company and lease-purchase fleets. Sterling's currently-hiring openings (per Todd's 5/2026 notes from Sterling) are a narrower subset:

- **Lease Van OTR** — wide open
- **Lease Van Midwest Regional** — wide open
- **Company Flatbed** — wide open
- **Lease Flatbed** — wide open
- Company Van — at capacity, not hiring
- Heavy Haul — out of scope for the Sterling channel (different hiring criteria; 6+ years experience; appears to route through a different funnel)
- DOD Teams, Owner-Operator programs — out of scope for this addendum

**This spec covers the 4 actively-hiring products** with a path to add more if/when Sterling opens them.

The handoff has three operational pieces:

1. CDLA.jobs delivers Anderson's IntelliApp link (Tenstreet) to qualified drivers
2. The driver completes the IntelliApp themselves on Tenstreet
3. CDLA.jobs pushes Type 1 (non-FCRA-regulated) driver data to Sterling's QuickBase via API for parallel tracking

### B1.1 What is not yet resolved about the channel relationships

A public-data review (drive4ats.com, workatandersontrucking.com, findandersontruckingjobs.com) surfaced a relationship question this spec does NOT resolve:

- Anderson operates its own careers site (drive4ats.com)
- Anderson-branded marketing/lead-capture pages (workatandersontrucking.com, findandersontruckingjobs.com) name **Randall Reilly Talent, LLC** as the joint TCPA recipient with Anderson — Randall Reilly is a recruitment marketing partner
- **Sterling Recruiting Solutions** is the third-party recruiter PHTP works with, with its own QuickBase tracking

The operational relationship between Sterling, Randall Reilly, and Anderson is not certain from the public data. Possibilities include: Sterling is a sub-arrangement under Randall Reilly's broader contract; Sterling is parallel and independent; the QuickBase channel only handles certain referral sources. This does not block this spec — CDLA.jobs's relationship is with Sterling, and the API push is to Sterling's QuickBase — but the relationship map should be clarified with Sterling before launching driver-facing copy that names any third party. See §B11.

### B1.2 What's locked vs. open

**Locked** (verified from Anderson's own qualification documents and Sterling's notes):
- Hiring criteria (age, experience, MVR, accidents, criminal, drug/alcohol, SAP)
- Equipment types per product
- Home time per product
- Pay ranges per product (Sterling's 3/2026 update)
- Orientation locations
- Hiring geography (Upper Midwest + Anderson's national OTR map)

**Open** (still requires Sterling confirmation):
- IntelliApp URL product mapping (one URL for all products, or one per product?)
- Sterling-to-Randall Reilly-to-Anderson relationship map
- QuickBase dropdown values for EXPERIENCE LEVEL, Driver Applying For, Company
- Whether driver-facing copy should name Sterling

---

## B2. The hard boundary — what CDLA.jobs does NOT do

This addendum sits inside the platform's prequalification legal model, same boundary as the Swift addendum §A2.

**CDLA.jobs must NOT, in this handoff or anywhere:**

- Fill out, pre-fill, or submit any part of the Anderson IntelliApp on the driver's behalf
- Collect, store, transmit, or display the driver's Social Security number
- Store FCRA-regulated application content (criminal history, drug/alcohol history, full DOT-required employment history, background-check authorizations, MVR data)
- Push FCRA-regulated data to Sterling's QuickBase — only Type 1 fields cross the API boundary (see §B5)
- Mirror Sterling's internal driver tracking state. CDLA.jobs maintains only a thin operational stage record (§B7)

The IntelliApp itself — which collects SSN, FCRA authorizations, and DOT-required history — is filled out by the driver, in Tenstreet, and lands in Anderson's Tenstreet account. That stays that way.

The QuickBase API push is the new compliance-sensitive piece of this addendum and must be reviewed by counsel before going live. See §B11.

---

## B3. The Anderson application flow

1. Driver is matched to an Anderson job on CDLA.jobs and chooses to apply
2. Driver completes Stage 2 consent per attorney addendum v2 (names PHTP and Anderson)
3. Driver completes Stage 2 qualifying questions; qualification logic runs against Anderson's criteria from `carrier_jobs`
4. If qualified, driver is given the IntelliApp link (single step, recruiter pre-coded in URL)
5. Driver completes the IntelliApp themselves on Tenstreet
6. CDLA.jobs pushes Type 1 fields to Sterling's QuickBase via API
7. Sterling contacts the driver, manages them through orientation and hire; Anderson handles DOT application work inside Tenstreet

### B3.1 The IntelliApp URL

Currently known URL:

```
https://intelliapp.driverapponline.com/c/anderson?r=CDL%20Hunterl&uri_b=ia_anderson_795672276
```

- `r=CDL%20Hunterl` — recruiter parameter, URL-encoded. Decodes to `CDL Hunterl`. The trailing `l` may be a typo for "CDL Hunter" or may be intentional. Confirm with Sterling.
- `uri_b=ia_anderson_795672276` — source identifier / campaign code

**Open question (§B10 Q1):** This is a single URL. Whether it routes drivers to the correct internal product (Lease Van OTR vs. Lease Van MW Regional vs. Company Flatbed vs. Lease Flatbed) inside the IntelliApp, or whether Sterling has separate URLs for each product, has not been confirmed. The current spec assumes one URL serves all 4 actively-hiring products; if Sterling has product-specific URLs, the `application_url` field in `carrier_jobs` rows is per-row and accommodates this with no schema change.

---

## B4. Anderson's `carrier_jobs` rows — 4 actively-hiring products

This is the data that needs to land in the carrier jobs database. All 4 rows share Anderson's company-wide criteria; only product-specific fields (equipment, home time, pay, hiring radius) differ.

### B4.1 Shared carrier-level data (`carriers` table)

| Field | Value |
|---|---|
| `name` | Anderson Trucking Service |
| `legal_name` | (verify — likely "Anderson Trucking Service, Inc.") |
| `kind` | `partner` |
| `tier` | `none` (set later if subscribes) |
| `status` | `active` |
| `business_address` | 725 Opportunity Dr., St. Cloud, MN 56301 |
| `public_careers_url` | https://www.drive4ats.com/ |
| `fmcsa_dot_number` | (verify on SAFER) |
| `fmcsa_mc_number` | (verify on SAFER) |
| `tenstreet_account_id` | `anderson` (from IntelliApp URL path) |
| `partner_handoff_config` | See §B4.5 |

### B4.2 Shared hiring criteria — all 4 jobs

From the ATS Driver Qualification Guidelines (revision 03-23-2026) and Pre-Qual Sheet:

| Schema field | Value | Source / notes |
|---|---|---|
| `min_age` | 21 | Pre-Qual Sheet ("Minimum 21 years of age") and Guidelines §A.1. **Schema gap:** v2 has no `min_age` field — captured in description for now. |
| `min_experience_months` | 6 | Per Guidelines §A.6.b: "At least six months of commercial driving experience within last 24 months." **Caveat:** the longer-window path (12 months in last 36 months) is also accepted, plus a third path (18 months OTR/regional in last 60 months allows local experience to count). The schema's single `min_experience_months_window_months = 36` cannot express all three paths. **Schema gap.** Setting to 6 captures the most permissive Anderson-side floor. |
| `min_otr_experience_months` | 0 for Company Flatbed; 12 for the 3 Lease products | Per Pre-Qual Sheet: "LP needs 12 months OTR exp in 3 years." Lease purchase requires more OTR than company. |
| `accepted_cdl_states` | `[]` (all states accepted) | Anderson hires nationally per their public hiring-areas map; no state restriction in guidelines. |
| `required_endorsements` | `[]` (none required) | "Hazmat Endorsement is recommended but not required" per Pre-Qual Sheet and Guidelines §B.2. |
| `accepts_terminated` | `true` (with conditions) | Guidelines §A.9: "Zero safety-related terminations within the past 12 months; No more than two terminations (safety or non-safety) within the past five years." **Schema gap** — the boolean field can't express the conditional. Set to `true`, surface conditions in description. |
| `accepts_failed_dot_test` | `false` | Guidelines §D.12: "Zero FMCSA or DOT positive and/or refusals of chemical drug or alcohol testing. Failure will result in immediate disqualification." Hard no. |
| `sap_tolerance` | `accepts_none` | Pre-Qual Sheet explicit: "NO SAP drivers!" |
| `max_tickets_3yr` | 3 | Guidelines §C.6: 4+ years experience: max 3 moving violations / Unsafe BASIC in last 36 months. Use the more permissive tier as the field value; the <4-year tier is a schema gap. |
| `max_accidents_3yr` | 3 | Guidelines §C.7: 4+ years experience: max 3 preventable accidents in last 36 months. Same logic. |
| `max_at_fault_accidents_3yr` | 3 | Same as above; Anderson's "preventable" mapping. Guidelines §C.9–§C.11 stack additional zero-tolerance rules for critical crash, roll-away, bridge strike — **schema gap**. |
| `accepts_dui` | `false` | Pre-Qual Sheet: "No drinking or drugs in CMV ever." Guidelines §D.2: zero DUI/DWI in PV in last 7 years; single conviction beyond 7 years requires safety approval. Setting to false is the matching-engine-safe choice; older single conviction is a manual review path that the schema can't express. |
| `dui_max_recency_months` | `84` (7 years) | Guidelines §D.2 — but see `accepts_dui = false` above. Field is set for documentation; the boolean takes precedence in matching. |
| `accepts_felony` | `false` | Guidelines §D.8: "Zero Felony convictions within the past seven years." Beyond 7 years requires safety review. Same logic as DUI — schema-safe to set false. **Schema gap:** absolute felony bars on sex offenses (§D.5) and recent homicide (§D.6) are stricter and aren't separately modelable. |
| `preferred_equipment_experience` | (per product, see §B4.3) | |
| `preferred_regions` | (per product, see §B4.3) | |
| `application_surface` | `tenstreet_intelliapp` | Single-step IntelliApp, Type 2 (driver completes themselves) |
| `application_url` | See §B3.1 (same URL for all 4 rows pending §B10 Q1 resolution) | |
| `application_form_schema` | NULL | Not used for `tenstreet_intelliapp` |
| `data_source` | `partner_intake` | |
| `last_verified_at` | 2026-05-31 | |
| `data_quality` | `complete` | All hiring criteria sourced from official Anderson docs |

### B4.3 Product-specific rows

#### Row 1: Lease Van OTR

| Field | Value |
|---|---|
| `position_title` | Lease Purchase Van — OTR |
| `description` | Lease purchase opportunity, OTR dry van. Drivers take home $1,500–$2,200/wk after expenses. Out 2–3 weeks at a time, home 2–4 days. Owner-op trucks must be 10 years old or newer. Lease drivers get to choose tractor at orientation from available options (Freightliner, Volvo, Peterbilt — predominantly Freightliner). All automatics. Orientation in St. Cloud, MN. Hazmat recommended but not required. NO SAP drivers. Anderson reserves the right to review based on PSP findings, prior terminations, job changes, and unemployment history; see internal qualification guidelines. |
| `equipment` | `dry-van` |
| `domicile_city` | St. Cloud |
| `domicile_state` | MN |
| `domicile_zip` | 56301 |
| `domicile_lat` | 45.5579 |
| `domicile_lng` | -94.1632 |
| `hiring_radius_miles` | 1500 | (Anderson's national OTR map covers most of the lower 48; using a large radius as a workaround until the irregular polygon is modelable — schema gap) |
| `min_otr_experience_months` | 12 |
| `accepted_home_time_types` | `otr` |
| `pay_range_max_weekly_usd` | 2200 |
| `display_pay_range_min_weekly_usd` | 1500 |
| `display_pay_range_max_weekly_usd` | 2200 |
| `display_signing_bonus_usd` | NULL (see §B10 Q7) |
| `display_home_time_description` | Out 2–3 weeks, home 2–4 days |
| `display_lane_description` | OTR — continental US and Canada |
| `display_benefits_summary` | Lease purchase: take home $1,500–$2,200/wk after expenses. Choose your tractor at orientation. Pet program available ($500 deposit, $250 non-refundable). Rider program: minors must be child/stepchild/grandchild. |
| `notes` | Tractor available at orientation — driver picks from inventory. Owner-op trucks must be ≤10 years old. Per Sterling 3/2026 update. |

#### Row 2: Lease Van Midwest Regional

| Field | Value |
|---|---|
| `position_title` | Lease Purchase Van — Midwest Regional |
| `description` | Lease purchase opportunity, Midwest regional dry van. Home every weekend for a 34-hour reset. Running area mostly Upper Midwest (centered on IL/IN/OH), with occasional runs to NJ and SC. ~50% drop-and-hook (varies). Drivers take home $1,500–$2,100/wk after expenses. Owner-op trucks must be 10 years old or newer. Lease drivers get to choose tractor at orientation. Orientation in St. Cloud, MN. Hazmat recommended but not required. NO SAP drivers. Anderson reserves the right to review based on PSP findings, prior terminations, job changes, and unemployment history; see internal qualification guidelines. |
| `equipment` | `dry-van` |
| `domicile_city` | St. Cloud |
| `domicile_state` | MN |
| `domicile_zip` | 56301 |
| `domicile_lat` | 45.5579 |
| `domicile_lng` | -94.1632 |
| `hiring_radius_miles` | 500 | (MW Regional map covers IL/IN/OH/MI/WI/MN/IA and adjoining areas; 500 mi from St. Cloud is a rough approximation — schema gap, irregular polygon) |
| `min_otr_experience_months` | 12 |
| `accepted_home_time_types` | `weekends` |
| `pay_range_max_weekly_usd` | 2100 |
| `display_pay_range_min_weekly_usd` | 1500 |
| `display_pay_range_max_weekly_usd` | 2100 |
| `display_signing_bonus_usd` | NULL |
| `display_home_time_description` | Home every weekend for a 34-hour reset |
| `display_lane_description` | Midwest regional — Upper MW centered on IL, IN, OH; occasional NJ/SC runs |
| `display_benefits_summary` | Same as Row 1 |
| `notes` | MW Regional map expanded recently. Per Sterling 2/2026 update: in Michigan, I-96 OK; avoid taking I-69 all the way to Port Huron — instead take I-75 SE around Flint into northern Detroit. Verify before driver match in Michigan. |

#### Row 3: Company Flatbed

| Field | Value |
|---|---|
| `position_title` | Company Driver — Flatbed (Specialized) |
| `description` | Company driver flatbed, specialized freight. Out 2–3 weeks, home 3–4 days. 1.5 days off for each week out; some areas require 3 weeks out. Solos and teams accepted (teams designed for couples — two-driver-supporting-two-households math rarely works). Grossing $1,500–$2,100/wk. Tractors: Freightliner, Volvo, Peterbilt (2/3 next year Freightliners); all automatics. Orientation in Porter, IN. Hazmat recommended but not required. NO SAP drivers. Anderson reserves the right to review based on PSP findings, prior terminations, job changes, and unemployment history; see internal qualification guidelines. |
| `equipment` | `flatbed` |
| `domicile_city` | St. Cloud |
| `domicile_state` | MN |
| `domicile_zip` | 56301 |
| `domicile_lat` | 45.5579 |
| `domicile_lng` | -94.1632 |
| `hiring_radius_miles` | 1500 | (National OTR coverage) |
| `min_otr_experience_months` | 6 | Pre-Qual Sheet: "Minimum 6 months FB experience (preferably with one company) within the last 2 years" — but this is FB-specific experience, not OTR. **Schema gap:** equipment-specific prior experience as a hard filter isn't in v2. Setting `min_otr_experience_months = 6` is a proxy; capture detail in `notes`. |
| `accepted_home_time_types` | `otr` |
| `pay_range_max_weekly_usd` | 2100 |
| `display_pay_range_min_weekly_usd` | 1500 |
| `display_pay_range_max_weekly_usd` | 2100 |
| `display_signing_bonus_usd` | NULL |
| `display_home_time_description` | Out 2–3 weeks, home 3–4 days |
| `display_lane_description` | OTR specialized flatbed — continental US and Canada |
| `display_benefits_summary` | Health (HealthPartners), Dental (Delta Dental), Vision (EyeMed), 401k with discretionary match (50% of first 4%, up to $1,000/yr employee max), Basic Life $20K AD&D. Vacation: 5 days at 1 yr, 10 days at 3 yrs, 15 days at 10 yrs. |
| `notes` | Min 6 months flatbed-specific experience preferred with single carrier — schema gap, captured here. |

#### Row 4: Lease Flatbed

| Field | Value |
|---|---|
| `position_title` | Lease Purchase Flatbed |
| `description` | Lease purchase opportunity, flatbed. Drivers take home $1,800–$3,000/wk after expenses ($1,500–$2,500/wk per Sterling 3/2026 pay update — see notes). Out 2–3 weeks, home 3–4 days (some areas 3 weeks). Solos and teams accepted. Lease drivers get to choose tractor at orientation. Orientation in St. Cloud, MN (for contractors). Hazmat recommended but not required. NO SAP drivers. Anderson reserves the right to review based on PSP findings, prior terminations, job changes, and unemployment history; see internal qualification guidelines. |
| `equipment` | `flatbed` |
| `domicile_city` | St. Cloud |
| `domicile_state` | MN |
| `domicile_zip` | 56301 |
| `domicile_lat` | 45.5579 |
| `domicile_lng` | -94.1632 |
| `hiring_radius_miles` | 1500 |
| `min_otr_experience_months` | 12 |
| `accepted_home_time_types` | `otr` |
| `pay_range_max_weekly_usd` | 3000 | Per Sterling notes top: take-home $1,800–$3,000/wk. Sterling's 3/2026 pay update says $1,500–$2,500. **Source conflict — flag in notes.** Using higher figure; ask Sterling to resolve. |
| `display_pay_range_min_weekly_usd` | 1500 |
| `display_pay_range_max_weekly_usd` | 3000 |
| `display_signing_bonus_usd` | NULL |
| `display_home_time_description` | Out 2–3 weeks, home 3–4 days |
| `display_lane_description` | OTR specialized flatbed — continental US and Canada |
| `display_benefits_summary` | Lease purchase: take home $1,500–$3,000/wk after expenses. Choose your tractor at orientation. |
| `notes` | Pay range conflict between Sterling openings notes ($1,800–$3,000) and 3/2026 pay update ($1,500–$2,500). Conservative display range used. Confirm with Sterling. |

### B4.4 Hiring radius — a known approximation

Anderson's actual hiring zones are **irregular polygons** (one national OTR map, one Midwest Regional map, both PNG images on drive4ats.com). The v2 schema uses `domicile_lat/lng + hiring_radius_miles` — a circle. **There is no clean fit.**

For Anderson, the approximation is:
- **National products (Lease Van OTR, Lease Flatbed, Company Flatbed):** `domicile = St. Cloud, MN` + `1500 mi radius`. This covers ~most of the continental US but inevitably includes areas Anderson does not hire from (e.g., the Pacific Northwest may be outside their actual OTR map; the Northeast corner may also be excluded).
- **MW Regional:** `domicile = St. Cloud, MN` + `500 mi radius`. Covers Upper MW reasonably but misses the eastward MI extension and includes some areas (e.g., far western Plains) that aren't in MW Regional.

**This is a known schema gap.** The matching engine will produce some false-positive matches for Anderson — drivers shown Anderson jobs they're actually outside Anderson's hiring zone for. Sterling will filter these out at qualification call. Until the schema supports irregular polygons (or until Anderson publishes a structured representation of their maps), this approximation is what we ship.

A more conservative approach: shrink the radii to ~800 mi and 350 mi respectively. Fewer false positives, more missed matches. Recommend starting with the larger radii and tightening if Sterling reports too much top-of-funnel noise.

### B4.5 `partner_handoff_config` for Anderson

Stored on the `carriers` table for Anderson (see §B6 for usage):

```json
{
  "handoff_type": "anderson_quickbase",
  "intelliapp_url": "https://intelliapp.driverapponline.com/c/anderson?r=CDL%20Hunterl&uri_b=ia_anderson_795672276",
  "recruiter_param_value": "CDL Hunterl",
  "source_identifier": "ia_anderson_795672276",
  "quickbase": {
    "realm_hostname": "sterlingrecruitingsolutions.quickbase.com",
    "app_id": "bcivf3yss",
    "table_id": "bcivf3ysv",
    "api_token_secret_ref": "QUICKBASE_STERLING_API_TOKEN",
    "default_recruiter_name": "Todd Bryson"
  }
}
```

If/when Sterling provides product-specific IntelliApp URLs, those move to the `application_url` field on each `carrier_jobs` row, and the `intelliapp_url` here becomes the default/fallback.

---

## B5. The QuickBase API push — what data, what fields, what the boundary is

### B5.1 QuickBase target

- **Realm hostname:** `sterlingrecruitingsolutions.quickbase.com`
- **App ID:** `bcivf3yss`
- **Table ID:** `bcivf3ysv`
- **API base URL:** `https://api.quickbase.com/v1` (QuickBase REST API v1 — verify against current QuickBase documentation at build time)
- **Authentication:** **QuickBase User Token** (NOT a username/password). Generated by Sterling from inside QuickBase UI under My Preferences → Manage User Tokens, scoped to the Sterling app(s). Passed in `Authorization` header as `QB-USER-TOKEN {token}`. Stored as `QUICKBASE_STERLING_API_TOKEN` in the platform secret store. Account credentials (login email + password) MUST NOT be used as a substitute — they grant full UI access, cannot be scoped, and cannot be revoked without disrupting human user access. If Sterling offers account credentials instead of a User Token, request the User Token explicitly; this is the correct artifact for system-to-system integration. See §B10 Q12.

I have not independently verified the QuickBase REST API endpoint path or auth header format. The developer building this should confirm against QuickBase's current API documentation. The shape above matches what's commonly documented for QuickBase v1 but versions change.

### B5.2 Fields CDLA.jobs sends to QuickBase

| QuickBase Field | Required | Source in CDLA.jobs | Notes |
|---|---|---|---|
| Company | Yes | Hard-coded per row: `"Anderson"` (or full legal name — confirm with Sterling) | Confirm exact value Sterling's QuickBase expects |
| First Name | Yes | `driver.first_name` | |
| Last Name | Yes | `driver.last_name` | |
| Home Phone | No | NULL | CDLA.jobs collects one phone, treated as cell |
| Cell Phone | Yes | `driver.phone` | |
| Email | Yes | `driver.email` | |
| Street | Yes | `driver.address_street` | See §B5.4 |
| City | Yes | `driver.address_city` | |
| State | Yes | `driver.address_state` | Two-letter |
| Zip | Yes | `driver.home_zip` | |
| Notes | No | See §B5.5 | |
| EXPERIENCE LEVEL | Yes | Derived from `driver.years_held`; map to Sterling's accepted values | See §B5.3 — open |
| Exp. | Unclear | Same value or free text — confirm with Sterling | See §B5.2 note below |
| Driver Applying For | Yes | Derived from the matched `carrier_job.position_title` | Confirm Sterling's accepted values |
| Status | No | NULL at handoff | Sterling sets |
| Info Needed | No | NULL | Sterling-owned |
| Documents | No | No file upload | CDLA.jobs sends no documents |
| Orientation Start Date | No | NULL | Sterling-owned |
| Hire Date | No | NULL | Sterling-owned |
| Candidate within 90 days | No | NULL | Sterling-owned |
| Recruiter Name | Yes | Hard-coded: `"Todd Bryson"` (per Sterling) | Confirm static or dynamic |

Note on `Exp.` field: it appears in the QuickBase form a second time after `EXPERIENCE LEVEL`. Unclear whether duplicate, separate field with same label, or free-text annotation. Confirm with Sterling.

### B5.3 EXPERIENCE LEVEL mapping — open

QuickBase's `EXPERIENCE LEVEL` is likely a fixed-value dropdown. CDLA.jobs's `driver.years_held` is numeric. Sterling-side accepted values not yet confirmed. Until confirmed, the API push does NOT go to production. Until then, staging/test pushes only.

### B5.4 Address fields — driver data availability

QuickBase requires Street, City, State, Zip. CDLA.jobs's current driver intake always captures Zip; full street address is not currently captured at intake.

**Recommendation:** Collect street/city at Stage 2 as part of the per-carrier consent step. By Stage 2 the driver has chosen to apply to a specific carrier, so the additional friction is contextually appropriate. Asking for full street address at intake is unnecessary friction before the driver has committed.

State and City can be deterministically reverse-geocoded from Zip when needed, but Street cannot.

### B5.5 Notes field content

Free text. Populate with:

```
Match received via CDLA.jobs on {YYYY-MM-DD}. Driver completed Stage 2 consent and qualifying questions, then was directed to Anderson IntelliApp. CDLA.jobs match ID: {match_id}. Matched job: {position_title}.
```

The `Matched job` line is important here — when CDLA.jobs sends drivers for 4 different Anderson products through a single QuickBase channel, Sterling needs to know which product each driver was matched to. (This is a partial workaround for the single-IntelliApp-URL question in §B10 Q1: even if Sterling sorts product internally, the Notes give them the CDLA.jobs-side context.)

### B5.6 Fields CDLA.jobs explicitly does NOT send to QuickBase

For clarity and re-checkability by counsel:

- SSN (CDLA.jobs does not have)
- Date of birth (CDLA.jobs does not have)
- Driver's license number / state (CDLA.jobs does not have)
- MVR data (CDLA.jobs does not have)
- Criminal history detail (CDLA.jobs has Stage 2 yes/no flags but does NOT push them)
- Drug / alcohol history (CDLA.jobs does not have)
- DOT employment history (CDLA.jobs does not have)
- Stage 2 internal disqualification reasons (internal only)
- Background check authorizations (CDLA.jobs does not collect)
- The IntelliApp confirmation number or any IntelliApp content (lives in Tenstreet)

Anderson's full driver qualification data (criminal background, drug screening, accident detail, employment history) is collected inside the IntelliApp by the driver themselves and lives in Anderson's Tenstreet — never in CDLA.jobs and never in the QuickBase push.

---

## B6. The CDLA.jobs handoff workflow

1. Apply initiated — driver clicks "Continue to apply" on their Anderson match
2. Stage 2 consent — per-carrier consent naming PHTP and Anderson (per attorney addendum v2)
3. Stage 2 qualifying questions — run against matched `carrier_job` criteria
4. If qualified, IntelliApp link delivered (with email; SMS only if TCPA-consented)
5. Stage record advances to `intelliapp_link_sent` (§B7)
6. Driver completes IntelliApp on Tenstreet
7. QuickBase API push triggered (see §B6.2)
8. Stage record advances to `submitted_to_sterling`
9. Driver sees confirmation: "Your information is with Anderson's recruiting team — they'll be in touch within 1–2 business days."

### B6.2 Push trigger pattern — Pattern 1 recommended

**Pattern 1 (recommended for v1):** Push to QuickBase immediately when IntelliApp link is delivered (step 4). Sterling sees the driver up front and can reach out proactively, regardless of whether the driver finishes the IntelliApp. Risk: Sterling sees drivers who never complete the IntelliApp.

**Pattern 2:** Push only after Tenstreet completion is signaled. Requires Tenstreet webhook integration (not currently in place) or driver self-confirmation.

Default: Pattern 1. Add Pattern 2 later as a refinement.

### B6.3 Failure handling

- 2xx: mark stage `submitted_to_sterling`, store QuickBase record ID
- 4xx (validation error): log, do NOT auto-retry, alert ops, set stage `submit_failed_validation`. Driver is not blocked (their data is already in Anderson's Tenstreet)
- 5xx / network: queue with exponential backoff (5min, 30min, 2h, 12h, 24h). Same fallback as 4xx on exhaustion
- 401 (token rejection): alert ops immediately, pause all pending pushes until token restored

---

## B7. CDLA.jobs's tracking record

Thin per-driver-per-carrier-job operational state record. Same pattern as Swift §A5.

Fields:
- `driver_id`, `carrier_job_id` (which of the 4 Anderson products)
- `stage` (enum: `apply_initiated`, `stage2_consented`, `intelliapp_link_sent`, `submitted_to_sterling`, `submit_failed_validation`, `submit_queued_for_retry`, `stalled`)
- `quickbase_record_id` (Sterling's returned ID, for traceability)
- `quickbase_push_attempted_at`, `quickbase_push_succeeded_at`
- `quickbase_push_attempts` (retry counter)
- `quickbase_last_error` (debug info, not driver PII)
- Stage transition timestamps

Does NOT hold: SSN, DOB, criminal/drug/alcohol history, IntelliApp content, MVR data, or anything FCRA-regulated.

---

## B8. Driver-facing experience

Per the Stage 2 build prompt's `tenstreet_intelliapp` standard single-link template, with Anderson-specific adjustments:

> You qualify for this position. Here's how to apply to **Anderson Trucking Service**:
>
> Before you start, make sure you have:
> - Your full job history for the past 10 years (including non-driving jobs)
> - 2 references
>
> [Complete Your Application — link]
>
> Once you finish the application, Anderson's recruiting team will be in touch within 1–2 business days.

**Sterling naming:** The current draft does NOT name Sterling Recruiting Solutions in driver-facing copy, since the relationship is operationally between PHTP and Sterling (and Anderson). When Sterling's recruiter calls the driver, the driver may experience some surprise hearing from "Sterling" about an "Anderson" application. **Confirm with Sterling whether they want their name surfaced to drivers proactively, or whether their recruiter will identify themselves on the call.** Updating the copy is trivial.

**No "select Other / source identifier":** Anderson's IntelliApp URL pre-codes the source via `uri_b`. The driver should not need to manually enter a source identifier. If the Tenstreet form still prompts for it despite the URL parameter, update the copy with guidance.

Driver-facing copy follows the brand voice guide: warm, plain, direct, no emojis.

---

## B9. Schema gaps surfaced by Anderson

See `SPEC_carrier-criteria-schema-gaps-v1.md` for the catalog. The Anderson ingestion surfaces these new items (or strengthens prior items):

1. **Multi-path experience requirements** (Anderson has 3 paths: 12mo/36mo, 6mo/24mo, 18mo OTR/60mo with local-counting). Builds on USX's 2-path gap.
2. **Equipment-specific prior experience as hard filter** (Anderson FB requires 6mo prior flatbed; not just OTR months)
3. **Tiered tolerance by experience years** (<4yr vs 4+yr for ticket/accident counts) — pervasive in Anderson's rules
4. **Critical-crash / roll-away / bridge-strike absolute bars** (zero in 24 months) — beyond simple ticket/accident counts
5. **PSP review reservation** (Anderson reserves the right to disqualify based on Pre-Employment Screening Program)
6. **Conditional termination acceptance** (zero safety in 12mo; ≤2 total in 5yr — overlapping windows + categorization)
7. **Job-change limits** (Anderson: ≤3 in 12mo, ≤5–6 in 36mo; not currently in v2)
8. **Unemployment-gap limits** (Anderson: ≤6mo in 12mo, ≤12mo in 36mo)
9. **Truck abandonment history** (Anderson: 0 in 36mo, ≤1 in 7yr)
10. **DUI with manual safety-review path beyond 7 years** (more than yes/no)
11. **Felony with manual safety-review path beyond 7 years** (same)
12. **Absolute felony bars** for sex offenses (any time) and recent homicide (20 years)
13. **Irregular hiring polygons** — Anderson's MW Regional and National OTR maps cannot be modeled as circles. Lossy approximation in B4.4.
14. **Lease vs. company pay structures** — net-after-expenses vs. gross have different meanings for driver comparison
15. **Min age separated from min experience** — Anderson requires 21 regardless of experience

Anderson row in the schema gaps doc per §B9 update task below.

---

## B10. Open questions

To resolve with Sterling before launch:

1. **IntelliApp URL — single vs. product-specific.** Does the current URL handle all 4 products, or are there 4 separate URLs?
2. **Recruiter parameter (`CDL Hunterl`)** — typo or intentional?
3. **EXPERIENCE LEVEL accepted values** in Sterling's QuickBase
4. **Exp. field** — duplicate of EXPERIENCE LEVEL, or different?
5. **Driver Applying For accepted values**
6. **Company field exact value** (`"Anderson"` vs. legal name)
7. **Sign-on bonus** — Pre-Qual sheet says "See each division"; Sterling notes don't break this out
8. **Sterling-to-Randall Reilly-to-Anderson relationship map**
9. **Driver-facing Sterling naming** — name Sterling in result copy, or only Anderson?
10. **Lease Flatbed pay range conflict** — $1,800–$3,000 (openings notes) vs. $1,500–$2,500 (3/2026 pay update)
11. **Tenstreet completion webhook** — does Sterling have it set up, or does the IntelliApp stand alone?
12. **QuickBase User Token issuance, scoping, and rotation cadence.** Specifically: Sterling must issue a **QuickBase User Token** (generated from inside QuickBase UI → My Preferences → Manage User Tokens) — NOT a username/password for a QuickBase user account. Account credentials grant full UI access to everything the user can see and do; a User Token can be scoped to specific apps, revoked independently, and is the correct artifact for system-to-system integration per the spec's auth model (§B5.1). Sterling also needs to confirm: which app(s) the token is scoped to (production app `bcivf3yss` only, or also a staging app), the rotation cadence (recommended: 90 days), the incident-response procedure if the token is suspected leaked, and which Sterling-side individual owns issuance/rotation.
13. **Recruiter Name field — always "Todd Bryson"?** Or driver-specific?
14. **Attorney review of the QuickBase push pattern** (see §B11)
15. **Anderson's actual hiring polygons** — is there a structured representation (KML, shapefile, GeoJSON) we could request? Would dramatically improve match precision.

---

## B11. Attorney review gate

The platform's prequalification model has been cleared for two patterns to date:
- IntelliApp link delivery (driver completes the form on the carrier's Tenstreet; CDLA.jobs is a router)
- Stage 2 per-carrier consent (driver authorizes a named carrier to receive prequalification data)

Anderson introduces a third pattern: **CDLA.jobs pushes Type 1 driver-provided data into a third-party recruiter's tracking system (Sterling's QuickBase) via API, after Stage 2 consent.**

Operationally similar to the prospect-carrier `custom_intake_form` submission pattern (also gated on attorney clearance per v2 addendum). The Anderson case is arguably more defensible — Sterling is a named, contracted partner of PHTP, and the consent at Stage 2 names PHTP and Anderson explicitly — but it's a new pattern and warrants review.

**Items to flag to counsel:**

- Stage 2 per-carrier consent text names PHTP and Anderson. Confirm whether it must also name Sterling as the data recipient, or whether "Anderson and its agents" framing suffices. Possible minor amendment to the consent.
- The Sterling-issued API token grants CDLA.jobs write access to Sterling's QuickBase. The PHTP-Sterling contractual relationship should cover data handling, token rotation, and incident response.
- The data being pushed is Type 1 (driver-provided, non-regulated). No FCRA-regulated data crosses the boundary. The fields in §B5.2 are exhaustive; any future addition requires re-review.

**Until counsel clears the QuickBase API push pattern, the push runs only against a Sterling-issued staging/test table, not production.** The rest of the handoff (Stage 2 consent, IntelliApp link delivery, CDLA.jobs's own tracking record) can ship without that clearance — those reuse already-cleared patterns.

---

## B12. What this addendum does not cover

- Heavy Haul, DOD Teams, Owner-Operator programs — out of scope until Sterling opens them through this channel
- Company Van — out of scope until Anderson reopens hiring
- The actual matching engine algorithm — built; separate spec
- The Stage 2 qualifying surface generally — separate; this is the Anderson-specific apply handoff that plugs into it
- QuickBase API client implementation details — belong in code, not spec
- Sterling's commission, billing, or hire-tracking processes — outside CDLA.jobs
- Anderson's DOT application work — Anderson handles inside Tenstreet
- Reverse-engineering Anderson's hiring map polygons — see §B10 Q15

---

## B13. Build sequence

1. **Anderson onboarding to `carriers`** — manual one-time. Add Anderson with `kind = partner`, business address, `partner_handoff_config` blob (§B4.5)
2. **Anderson `carrier_jobs` rows** — 4 rows per §B4.3, manually authored
3. **Stage 2 result-page copy update** — handle Anderson-specific result-page text per §B8
4. **CDLA.jobs's Anderson tracking record schema** — migration for `anderson_application_stages` (or unified `partner_application_stages`)
5. **QuickBase API client module** — auth, request shape, error handling, retry queue
6. **Push trigger wiring** — Pattern 1
7. **Staging push verification** — Sterling provides staging QuickBase; CDLA.jobs pushes test records; iterate on field mappings
8. **Attorney review of production-push pattern** (§B11)
9. **Production cutover** — switch QuickBase target from staging to production; first real driver monitored end-to-end
10. **Stall follow-up via nurture** — same pattern as Swift §A4.2

---

## B14. Change log

| Date | Change | By |
|------|--------|-----|
| 2026-05-31 | v1 DRAFT created — single-product Anderson handoff | Todd + Claude |
| 2026-05-31 | v2 — full rewrite. Scope narrowed to 4 actively-hiring Sterling products. Hiring criteria locked from ATS Driver Qualification Guidelines 03-23-2026 + Pre-Qual Sheet + Driver Orientation Guidelines. Multi-product modeling in `carrier_jobs`. 9+ new schema gaps surfaced. Open questions narrowed. | Todd + Claude |
| 2026-05-31 | v2 (in-place edit) — clarified §B5.1 authentication: Sterling must issue a QuickBase User Token, not raw account credentials. Expanded §B10 Q12 with specifics for Sterling on token scoping, rotation, incident response, and ownership. | Todd + Claude |

---

*End of addendum.*
