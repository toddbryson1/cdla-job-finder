# Transport America (TA Dedicated) Jobs Sync Spec

**Version:** 2.0
**Status:** DRAFT — for review. Supersedes v1.
**Audience:** Internal — product, engineering, Todd
**Owner:** Todd Bryson
**Companion documents:** Carrier Jobs Database Schema v2, Matching Engine Field Schema v2.1, Swift Smartsheet Sync Spec v1, TA Dedicated Application Handoff Addendum v1

---

## 0. What changed from v1, and why

v1 specified an openings-sheet-only sync with all jobs at `minimal` quality, on the stated assumption that there was **no join key** between the openings sheet and the account-detail workbook.

That assumption was wrong. The account-detail workbook has **one named tab per job/account, and the tab name is the job name** (`3M Aberdeen SD`, `AA/Carquest Bakersfield, CA`, etc. — roughly 50 tabs). The tab name is the join key. v1's "no key" conclusion was an artifact of how the workbook was first read (tabs flattened into one stream, names stripped).

v2 therefore specifies a **two-source keyed sync**: the openings sheet drives which jobs are open and their status/counts; each opening is resolved to its detail tab by name; the detail tab supplies the rich content. Jobs that resolve to a tab confidently reach `partial` or `complete` quality. v1's Option A is retired.

The join is still **name-to-name** and therefore fuzzy (§5). v2's safeguard is a confidence threshold plus a one-time human review of uncertain matches (§6) — not silent guessing.

---

## 1. Purpose and scope

This spec covers reading Transport America's dedicated-division open jobs ("TA Dedicated") into `carrier_jobs`. It is the second real-carrier sync path after Swift.

There are two source sheets and the sync uses **both**:

- **The openings sheet** — which jobs are open right now, how many drivers each needs, and open/filled status. This is the authority on *what is active*.
- **The account-detail workbook** — one tab per job, carrying the rich content (hiring radius, endorsements, pay, home time, equipment, lanes). This is the authority on *what each job is*.

Neither sheet alone is sufficient. The openings sheet has no job detail; the detail workbook has no open/filled signal or driver counts.

---

## 2. The two source sheets

### 2.1 The openings sheet ("Dedicated Spreadsheet" tab)

The first tab of the openings workbook. The sync reads only this tab of that workbook (§8).

Columns:

- **Date Opened**
- **Division** — free-text job identifier: account, location, role/shift, sometimes parenthetical requirements jammed together. Examples: `AAP/CQ - Blaine, MN Flex`, `3M - Aberdeen, SD Solo`, `CAT Girtz Shuttle - Double Drop (4 for 1st shift and 1 for 2nd shift) 2 trainees per week`.
- **Drivers Needed** — count, sometimes free text (`2`, `1 (1/2 team)`).
- **Dated columns** (orientation class dates) — cells contain DLM recruiter-name-with-count (`Karen(1)`). **DLM internal recruiting data — NOT synced.**
- Trailing single-letter index column — internal reference, not synced.

**Grey-shaded rows mean the opening is filled** (§4).

### 2.2 The account-detail workbook — one tab per job

A separate workbook (~50 tabs). Each tab is named for a job/account (`3M Aberdeen SD`, `3M Prairie du Chien WI`, `3M Team Dekalb-Houston`, `AA/Carquest Bakersfield, CA`, ...). The workbook also contains a few **non-job policy tabs** (`Hiring Guidelines`, `Time out of the truck`, `Passenger Policy`, `Pet Policy`) — these are not jobs and are not synced as jobs (§7).

Each job tab holds, in a mostly-but-not-perfectly consistent layout, fields such as: Hiring Area (radius + anchor city), Lanes, Miles, Schedule, Home Time, Freight Types, Truck Speed, Requirements (experience, endorsements), Equipment, Pay / Entry Points, Bonuses. Some tabs are clean key/value tables; some are prose. Parsing is per-tab and best-effort (§5.2).

### 2.3 Tabs and workbooks explicitly NOT synced

- The **openings workbook's** other tabs — Waitlist (real driver names), Exclude From Waitlist, BPI Relay, BPI Shuttle, Teams — are never read. Only the "Dedicated Spreadsheet" tab is read from that workbook.
- The **detail workbook's** policy tabs — Hiring Guidelines, Time out of the truck, Passenger Policy, Pet Policy — are not job tabs and are not synced as jobs.
- See §8 for the hard rule.

---

## 3. Carrier identity

These jobs belong to **Transport America** — its dedicated division. Transport America operates within the UPS Freight Truckload / TForce lineage.

- Carrier record name: **Transport America** (real public carrier name).
- Recruiting agency: **DLM Professional** — always the agency for TA Dedicated. Relevant to the application handoff, not the jobs sync; the carrier record should note DLM as the associated agency.
- PHTP and CDLA.jobs are not the carrier. CDLA.jobs is the publishing/matching site; Transport America is the carrier; DLM is the agency.

---

## 4. Open vs. filled detection

The openings sheet signals "filled" by **grey row shading** — cell background formatting, not a data value.

This signal is only visible if the sheet is read through an access method that exposes cell formatting (Google Sheets API with cell-format fields). A plain values export (CSV/text) loses it entirely.

**v2 requirement:** read the openings sheet through a format-aware method; treat a grey-shaded Division cell as a filled (inactive) job.

**Strongly recommended (§11):** ask DLM to add an explicit `Status` text column (`Open`/`Filled`). This converts a fragile formatting signal into reliable data and is a trivial change to a ~50-row sheet.

---

## 5. The two-source join and parsing

### 5.1 Resolving an opening to its detail tab — the keyed join

For each active opening, the sync resolves the matching detail-workbook tab by **name similarity**. This is the join. It is fuzzy because the names are close but not identical:

| Opening (Division) | Likely detail tab |
|---|---|
| `3M - Aberdeen, SD Solo` | `3M Aberdeen SD` |
| `AAP/CQ - Blaine, MN Flex` | (an `AA/Carquest`-prefixed Blaine tab) |
| `Norfolk Southern Altoona/Max Meadows` | (a Norfolk Southern tab) |

Differences the matcher must tolerate: punctuation (`-`, `/`, `,`), abbreviation variants (`AAP/CQ` vs `AA/Carquest`), word order, and the trailing role/shift suffix (`Solo`, `Flex`, `Team`, `Shuttle`) which may or may not appear in the tab name.

The matcher:

1. Normalizes both strings (lowercase, strip punctuation, collapse whitespace, expand known abbreviation variants — `AAP`→`AA`, `CQ`→`Carquest`, etc.).
2. Scores similarity between the normalized opening and each normalized tab name.
3. Assigns the best-scoring tab **only if the score clears a confidence threshold**.
4. If the best score is below threshold, or two tabs tie closely, the opening is marked **`unresolved`** — no tab data is attached, and the opening is listed for human review (§6).

The matcher must never attach a tab's data to an opening below the confidence threshold. A wrong match shows a driver another job's pay or endorsements — strictly worse than showing no detail.

### 5.2 Parsing a resolved detail tab

When an opening resolves to a tab, the sync parses that tab for:

- **Hiring radius + anchor city** — from the "Hiring Area" field (e.g. "50 mile radius of McCalla, AL"; "100 mile radius of Dallas, TX"). Note some Hiring Area values carry extra rules ("Must park at Dallas Yard — No Exceptions") — captured to notes.
- **Required endorsements** — from Requirements / Endorsements fields (Hazmat, Tanker appear frequently).
- **Experience requirement** — from Requirements (e.g. "6 months of recent verifiable experience", "12 months").
- **Home time** — from the Home Time field.
- **Equipment** — from Equipment / freight description (dry van, box truck, flatbed, step deck; trailer length where given).
- **Pay** — from Entry Points / Pay (often tiered by experience or shift; multi-row). Parse to a usable range; preserve raw text.
- **Lanes / states** — captured to notes / structured where clean.

Tab layouts are not perfectly uniform — some key/value, some prose. The parser is best-effort and per-field tolerant: a field it cannot parse stays NULL rather than guessed. A tab that parses very little still yields a `partial` job (it resolved to a real tab; it just had thin content).

### 5.3 Class designation

Openings explicitly marked `CDL-B` (`Foley - Dodge City, KS CDL-B`, `VWR - Aurora, CO CDL-B`) must not be synced as CDL-A jobs. CDLA.jobs is a CDL-A platform. CDL-B rows are excluded unless the row/tab clearly indicates CDL-A is also accepted (§7).

---

## 6. Data quality tiers and the human review step

Each synced job's `data_quality` is set honestly by how it resolved:

- **`complete`** — opening resolved to a detail tab above threshold, and the tab yielded the core fields (radius/location, equipment, experience, pay, home time).
- **`partial`** — opening resolved to a detail tab, but the tab was thin or several core fields could not be parsed.
- **`minimal`** — opening did not resolve to a tab (`unresolved`), or resolved tab had almost no usable content. Job carries only what the Division string yields (account, city, role).

### 6.1 Human review of uncertain matches — required

With ~50 jobs, the fuzzy join is small enough to verify once by a person. The sync must produce a **match review report** listing, for each opening: the chosen tab, the confidence score, and any `unresolved` openings. A human confirms or corrects the uncertain ones a single time. The confirmed mapping is then stored (an explicit opening→tab mapping table), so subsequent syncs use the verified mapping and do not re-guess.

This review step is what makes name-matching safe to rely on. It is not optional. It is also cheap — once, for ~50 rows, then stable.

---

## 7. Exclusion rules

A row/tab is excluded from `carrier_jobs` when:

1. The opening's Division indicates **CDL-B** and not CDL-A (§5.3).
2. The opening row is blank, a header, or the `Total:` summary row.
3. The item is a detail-workbook **policy tab** (`Hiring Guidelines`, `Time out of the truck`, `Passenger Policy`, `Pet Policy`) — not a job.

Filled (grey) openings are not excluded — they sync with inactive status (confirm in §11 whether to sync-as-inactive or skip).

Openings that are `unresolved` (no confident tab) are **not** excluded — they sync as `minimal`-quality jobs (§6). Confirm in §11 whether a `minimal` TA Dedicated job should surface to drivers at all, or be held for review only.

---

## 8. Hard data-handling rules

Requirements, not defaults.

1. **Openings workbook: only the "Dedicated Spreadsheet" tab is read.** Waitlist, Exclude From Waitlist, BPI Relay, BPI Shuttle, Teams are never read, ingested, stored, or transmitted. The Waitlist tab contains real drivers' names — out of scope, full stop.
2. **Detail workbook: only job tabs are read.** Policy tabs are read only if needed as reference for the Driver Qualification Guidelines mapping (§9) — never synced as jobs.
3. **No driver personal data.** The openings sheet's dated columns hold DLM recruiter names with driver counts; the sync extracts only the open/needed signal, never recruiter names as data, never anything identifying a driver.
4. The sync writes to `carrier_jobs` (and the opening→tab mapping table). It does not write back to either Google Sheet.

---

## 9. Transport America Driver Qualification Guidelines

Transport America publishes Driver Qualification Guidelines (Level 1 vs Level 2 accounts — Level 1 = 6 months verified CDL experience, Level 2 = 12 months; ticket/accident/DUI windows; criminal-history rules). The Guidelines also appear as a policy tab in the detail workbook (`Hiring Guidelines`).

The Guidelines name the Level 2 accounts explicitly: **Foley, Quality Steel, Hyundai, Owens Corning, Advance Auto, Honda, LP Cylinder.** This means a job's Level can be inferred from its parsed account name, and `min_experience_months` set to 6 (Level 1) or 12 (Level 2) accordingly — a worthwhile enhancement.

**v2 position:** the per-tab Requirements field is the primary source for experience (§5.2). The Level 1/Level 2 rule is a useful cross-check and a fallback when a tab's Requirements field is unparseable. The broader safety-window rules (tickets, accidents, DUI) are not mapped into `carrier_jobs` in v2 — they do not fit the schema's fields cleanly (same issue as Swift) and mapping them is owner-judgment work tracked as a separate possible spec (§11).

---

## 10. Mapping to `carrier_jobs`

| `carrier_jobs` field | Source |
|---|---|
| `carrier_id` | Transport America carrier record (§3) |
| `position_title` | Parsed from Division; full Division string preserved |
| `domicile_city` / `domicile_state` | Detail tab Hiring Area anchor city; fallback to Division parse |
| `domicile_lat` / `domicile_lng` | Geocoded from anchor city |
| `hiring_radius_miles` | Detail tab Hiring Area radius |
| `equipment` | Detail tab Equipment/freight; NULL if absent (never guessed) |
| `min_experience_months` | Detail tab Requirements; fallback to Level 1/2 rule (§9) |
| `required_endorsements` | Detail tab Requirements/Endorsements |
| `accepted_home_time_types` | Detail tab Home Time |
| `pay_range_*` | Detail tab Entry Points/Pay; raw text preserved |
| `sap_tolerance` | Not in source — NULL / carrier default |
| `application_surface` | `tenstreet_intelliapp` |
| `application_url` | Transport America IntelliApp link (config; see handoff addendum §A3.1 — the signature-screen link) |
| `status` | `active` if opening not grey-shaded; inactive if grey (§4) |
| `data_source` | `transport_america` |
| `data_quality` | `complete` / `partial` / `minimal` per §6 |
| `verification_status` | `unverified` or carrier-relationship default — sourced from DLM-maintained sheets, not direct carrier confirmation |
| `drivers_needed` | Openings sheet Drivers Needed (free-text tolerant; raw value also stored) |
| `notes` / internal | Parentheticals, lanes, parking rules, full Division string, resolved tab name + confidence |

For an `unresolved` opening, detail-sourced fields are NULL and the job is `minimal` (§6).

---

## 11. Open questions

1. **Confidence threshold** for the name match (§5.1) — set after seeing the match report on a first run.
2. **Open/filled signal** (§4) — confirm the shading; better, ask DLM for a `Status` column.
3. **An explicit tab-name column** — best fix of all: ask DLM to add a column on the openings sheet naming the exact detail tab per opening. Eliminates fuzzy matching entirely. ~50 rows; trivial for DLM. Strongly recommended.
4. **Filled openings** — sync as inactive, or skip?
5. **`unresolved` / `minimal` jobs** — surface to drivers, or hold for review only?
6. **No-location jobs** — if a resolved tab still yields no usable location (or an opening is `unresolved` and the Division has no city — `Quality Steel`, `LP Cylinder`), held out for manual location entry (recommended) or created non-geomatchable?
7. **NULL-equipment jobs** — how does the matcher treat a job with NULL equipment vs a driver's equipment preference? Determines whether thin jobs surface.
8. **`data_source` enum value** — confirm `transport_america`.
9. **Sync cadence** — how often do the sheets change?
10. **Sheet access method** — confirm a format-aware Google Sheets API integration (needed for §4) and that it can enumerate the detail workbook's ~50 tab names.
11. **Safety-window mapping** — is a separate spec wanted to map the Guidelines' ticket/accident/DUI windows into the schema (owner-judgment work)?

---

## 12. What this spec does not cover

- The TA Dedicated application handoff — see the TA Dedicated Application Handoff Addendum v1
- The matching engine (built; separate)
- DLM Professional's internal recruiting operations, Waitlist, or class scheduling — DLM's system

---

## 13. Change log

| Date | Change | By |
|------|--------|-----|
| 2026-05-22 | v1 DRAFT — openings-sheet-only sync, minimal quality (on wrong "no join key" assumption) | Todd + Claude |
| 2026-05-22 | v2 DRAFT — corrected: detail workbook has one named tab per job; two-source keyed sync via tab-name matching; confidence threshold + one-time human review; quality tiers complete/partial/minimal by match outcome | Todd + Claude |

---

*End of spec.*
