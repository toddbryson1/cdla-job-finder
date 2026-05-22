# Prospect Carrier Job Ingestion Spec — CDLA.jobs

**Version:** 1.0
**Status:** DRAFT — high-level product spec; depends on attorney clearance of unsigned-prequalification submission mechanic
**Audience:** Internal — product, engineering, sales operations
**Owner:** Todd Bryson
**Companion documents:** Carrier Jobs Database Schema v2, Matching Engine Field Schema v2.1, Prospect Carrier Outreach Email Spec v1, Attorney Brief Addendum v2

---

## 1. Purpose

This document specifies the **prospect carrier job ingestion pipeline** — the system that finds carrier job postings on public careers pages, extracts structured data from them, classifies the application surface, and populates the carrier jobs database so they appear in driver match results.

This is the bridge between "we don't have a hiring relationship with carrier X" and "carrier X's open jobs show up in driver match lists."

The pipeline has five operational concerns:

1. **Discovery** — finding carriers and their job postings
2. **Extraction** — parsing structured data from unstructured job posts
3. **Classification** — identifying what kind of application form the carrier uses
4. **Submission** — for Type 1 forms, submitting prequalification on driver's behalf at Stage 2
5. **Outcome handling** — the email driver gets when submission can't be completed

The output of the ingestion pipeline is rows in the `carrier_jobs` table with appropriate `data_source`, `data_quality`, `application_surface`, and other fields populated per Carrier Jobs Database Schema v2.

---

## 2. Strategic context and honest limitations

Before specifying mechanisms, three honest framings:

### 2.1 This pipeline is the highest-uncertainty system in the project

Compared to the matching engine (well-understood logic), the intake (clear user flow), or the nurture sequences (defined content), prospect carrier job ingestion has the most engineering unknowns. Why:

- Carrier careers pages are wildly heterogeneous (no standard structure)
- Most career data is unstructured text
- Application forms vary in ways that don't predict from URL or carrier size
- Anti-bot defenses (CAPTCHA, rate limiting, IP blocking) are common
- Carrier terms of service vary on scraping permissions
- Job postings get stale; re-scraping cadence affects data freshness
- The legal posture (TOS, CFAA, FCRA) has more surface area than partner workflows

### 2.2 Expected initial success rate is modest

The platform should plan for:

- **Discovery success:** ~80-90% of FMCSA-listed carriers (most have public web presence)
- **Job extraction success:** ~40-70% of discovered carriers (depending on careers-page structure)
- **Application surface classification accuracy:** ~70-85% (LLM-based; some carriers misclassified)
- **Type 1 form submission success at launch:** **30-60%** for jobs with classified surfaces (the "we'll do our best" success rate Todd mentioned)
- **Type 1 form submission success after 6 months of per-carrier handlers:** **60-80%** (manual schemas for common carriers improve rates dramatically)

These are estimates based on similar scraping/automation projects. Real numbers may be lower at launch and improve over time as per-carrier handlers are built.

### 2.3 This is a v1 spec, not a finished system

The ingestion pipeline benefits enormously from real-world operational data. The spec describes the architecture and the initial implementation approach. Many details (exact LLM prompts, error retry policies, anti-bot evasion strategies) will be refined operationally during the first 60-90 days of operation.

The product can launch with imperfect ingestion. Drivers see fewer matches initially. As ingestion improves, match coverage grows.

---

## 3. Discovery — finding carriers and their job postings

### 3.1 Carrier discovery sources

**Primary source: FMCSA Motor Carrier Census.**
- Federal database of all DOT-regulated carriers
- Contains MC/DOT numbers, business addresses, fleet sizes, contact info
- Public, free, downloadable as bulk data
- Recommended ingestion: monthly snapshot, deduplicated against existing carriers

**Secondary source: targeted manual additions.**
- Sales operations may identify specific carriers worth scraping (large fleets, hiring aggressively, recommended by partners)
- Manual additions go into the same pipeline as FMCSA-discovered carriers
- Useful for carriers not in FMCSA (rare but possible)

**Tertiary source: driver-suggested carriers.**
- When a driver searches for a specific carrier we don't have, the system can flag it for ingestion
- Useful signal: drivers know who's hiring
- Implementation: log search misses and review weekly

### 3.2 Job posting discovery per carrier

For each discovered carrier:

1. **Find the careers page.** Try standard URLs:
   - `{carrier_domain}/careers`
   - `{carrier_domain}/jobs`
   - `{carrier_domain}/employment`
   - `{carrier_domain}/drivers`
   - `{carrier_domain}/apply`
   - Fall back to Google search: `"{carrier_name}" careers OR driver jobs`

2. **Identify job listings on the page.** Two patterns:
   - **Listing page** — multiple jobs on one URL; each linkable to its own detail page
   - **Single-page** — one job posting on the careers page itself
   - **External listing** — jobs hosted on Indeed, ZipRecruiter, Tenstreet, or other third party

3. **For each individual job, extract the job URL or page content.**

4. **Store as candidate jobs** for extraction.

### 3.3 Discovery cadence

- Initial discovery: when carrier first ingested
- Re-discovery: every 30 days for active carriers
- Re-discovery: every 90 days for carriers with no active jobs found in 90+ days
- Manual trigger: anytime sales or product team requests refresh

### 3.4 Discovery failure modes

- Carrier has no public website → flag as `careers_url = null`; can't proceed
- Website exists but no careers page → flag as `careers_page_not_found`
- Careers page exists but no jobs listed → flag as `no_jobs_listed`; re-check in 30 days
- Anti-bot protection blocks discovery → flag as `discovery_blocked`; mark for manual review

Failed discovery doesn't archive the carrier — it just means we can't surface jobs for them right now. The carrier stays in the prospect pool with appropriate flags.

---

## 4. Extraction — parsing structured data from job postings

### 4.1 Extraction approach: LLM-based

Per Stack Decisions, the LLM provider is Claude (Sonnet 4.6 for complex extraction, Haiku 4.5 for high-volume simple extraction).

Extraction sends the job posting (HTML or text) to the LLM with a structured prompt asking for:

- Equipment type (matched against the equipment enum)
- Position title
- Job description summary
- Domicile city/state (extracted from title, description, or page context)
- Domicile zip if available
- Hiring radius if mentioned (rarely explicit; usually inferred from "local," "regional," or "OTR" framing)
- Pay range (min and max weekly USD if disclosed)
- Required experience (minimum years/months)
- Required OTR experience (if OTR job)
- Required endorsements (hazmat, tanker, doubles, etc.)
- Home time type (daily, weekly, biweekly, otr)
- Accepted CDL states (rarely listed; usually all)
- Termination/SAP/test policies (rarely listed; default to conservative `false`)
- Application surface hints (URL, email, phone if mentioned)

The LLM returns structured JSON matching the `carrier_jobs` schema (minus the geospatial lat/lng, which gets geocoded separately).

### 4.2 Extraction quality tiers

The LLM returns a confidence score per field. Based on what's extracted:

- **`data_quality = complete`** — all required fields extracted with high confidence (>0.85)
- **`data_quality = partial`** — equipment, location, and some criteria extracted; others use conservative defaults
- **`data_quality = minimal`** — only carrier identity, basic location, and "we don't know" for criteria

Conservative defaults are critical: if we don't know whether a carrier accepts SAP, default to `accepts_none` (most restrictive). If we don't know whether they accept terminated drivers, default to `false`. Drivers see fewer matches but the matches they see are more likely to actually work out.

### 4.3 Geocoding extracted locations

After extraction:

1. If `domicile_zip` is present → look up in `zip_codes` table → populate lat/lng
2. If only `domicile_city` and `domicile_state` are present → look up in `zip_codes` table for representative zip → populate lat/lng (centroid of that city/state)
3. If neither is determinable → fall back to carrier's FMCSA business address (already geocoded at carrier discovery)
4. If even that is missing → mark job `data_quality = minimal` and skip from matching

### 4.4 Hiring radius defaults

Rarely explicit in job postings. Inferred from:

- Job mentions "local" or "home daily" → 75 miles default
- Job mentions "regional" → 150 miles default
- Job mentions "OTR" or "over the road" → NULL (no radius)
- Job description ambiguous → 200 miles default (errs toward more matches than too few)

These defaults can be overridden by manual review or carrier self-service updates.

### 4.5 Extraction failure modes

- LLM can't parse the page (CAPTCHA wall, paywall, etc.) → flag as `extraction_failed`
- Page is mostly imagery (PDF, scanned form) → flag as `extraction_blocked_format`; could OCR but high cost
- Multi-job page where extraction is ambiguous (multiple jobs in one block) → flag as `multi_job_ambiguous`; manual review queue
- Job posting is for non-CDL roles (mechanic, dispatcher, etc.) → flag as `not_cdl_role`; archive

---

## 5. Classification — identifying the application surface

### 5.1 Application surface enum (per Carrier Jobs Database Schema v2)

- `tenstreet_intelliapp` — full DOT application via Tenstreet; Type 2
- `custom_intake_form` — pre-application Type 1 form
- `email_only` — apply by email
- `phone_only` — call to apply
- `unknown` — surface not yet classified

### 5.2 Classification heuristics

For each discovered job, examine:

**Application URL patterns:**
- `tenstreet.com/*` → `tenstreet_intelliapp`
- `tenstreet-co.com/*` → `tenstreet_intelliapp`
- `careers.driverreach.com/*` → likely `tenstreet_intelliapp` (DriverReach uses similar Type 2 flow)
- `myworkdayjobs.com/*` → likely `custom_intake_form` (Workday-hosted)
- `boards.greenhouse.io/*` → `custom_intake_form` (Greenhouse-hosted)
- Self-hosted form on carrier's domain → likely `custom_intake_form` (further analysis needed)

**Form structure analysis (for custom forms):**
- Fields include SSN, FCRA authorization checkbox, driver's license number, prior employment history with dates → likely Type 2 (needs caution; could be Tenstreet white-labeled)
- Fields are only name, contact, basic experience → `custom_intake_form` (Type 1, safe to submit)
- No form visible; phone/email only → `phone_only` or `email_only`

**Disambiguation when unclear:**
- Mark as `unknown` and queue for manual review
- Better to err toward `unknown` than misclassify

### 5.3 Tenstreet detection

Tenstreet-hosted applications are common in trucking. They look like `tenstreet.com/apply/{carrier_id}/...` or are embedded iframes. These are always `tenstreet_intelliapp` (Type 2). Never auto-submit.

If a carrier's careers page redirects to Tenstreet, classify as `tenstreet_intelliapp` and store the URL as the deep-link for driver handoff.

### 5.4 Form schema extraction (for custom_intake_form)

If classified as `custom_intake_form`, the next step is generating an `application_form_schema` per Carrier Jobs Database Schema v2 §4.6.2. This requires:

1. Loading the form HTML
2. Identifying field elements (input, select, textarea)
3. Mapping carrier-form fields to CDLA.jobs prequalification fields
4. Identifying success/failure indicators on submission

This can be LLM-assisted or manual. Either way it's per-carrier work. Estimate: 30-60 minutes per carrier for an experienced engineer; 5-15 minutes if the carrier uses a well-known platform (Workday, Greenhouse) with templated mapping.

For prospect carriers at launch, form schema extraction is **out of scope for v1** — prospect carriers with `custom_intake_form` get marked but submission won't be enabled until per-carrier schemas exist. The match result returns `applicationSurface: 'custom_intake_form'` so the UI can show "apply directly via [URL]" as a fallback.

A future build session adds the schema extraction tooling.

---

## 6. Submission — Type 1 prequalification submission

### 6.1 Scope and legal posture

When a driver picks a prospect carrier with `application_surface = 'custom_intake_form'` or `'email_only'` at Stage 2:

1. Driver consents per the v2 attorney addendum's Stage 2 per-carrier consent (names PHTP, names the selected carrier, authorizes data transfer)
2. CDLA.jobs submits the prequalification (driver-provided data only, no FCRA-regulated authorizations) to the carrier's public form or email
3. The carrier handles all FCRA / DOT 391 work in their follow-up process

**Legal posture:** unsigned-prequalification submission. Driver authorized at Stage 2. No signed authorizations transferred. No FCRA-triggering actions taken by CDLA.jobs.

This entire flow is **gated on attorney clearance** per the v2 attorney addendum's open decisions (line 921 of the v2 addendum: "Whether unsigned-prequalification submission to public application forms is legally safe"). Until cleared, the submission pipeline does not run in production.

### 6.2 Submission mechanics

**For `custom_intake_form`:**

1. Load the carrier's form URL (headless browser or HTTP client per anti-bot needs)
2. Populate fields per `application_form_schema` mapping
3. Submit the form
4. Detect success or failure via `success_indicators` and `failure_indicators` in the schema
5. Record submission status: `submitted_successfully`, `submission_failed`, `submission_inconclusive`

**For `email_only`:**

1. Format the driver's prequalification as a structured text/HTML email
2. Optionally attach a PDF summary
3. Send to `application_email` from CDLA.jobs's transactional email infrastructure
4. CC the driver if requested
5. Record submission status

### 6.3 Anti-bot considerations

Some careers pages use CAPTCHA, rate limiting, or IP-based blocking. The submission pipeline needs:

- **Polite scraping:** respect robots.txt, add delays between requests, rotate user agents responsibly
- **CAPTCHA handling:** fail gracefully when encountered; do not attempt CAPTCHA bypass
- **Rate limit awareness:** if a carrier's form rate-limits at 1 submission per minute, the queue respects that

Carriers actively blocking automated submission are flagged. Their `application_surface` reverts to `unknown` with a note. The driver sees a fallback "apply directly" link instead of an auto-submission.

### 6.4 Submission queue and retry

- Submissions enqueue immediately on Stage 2 consent
- Queue worker processes submissions with appropriate per-carrier rate limiting
- Failed submissions retry up to 3 times with exponential backoff
- After 3 failures, transition to "submission_failed" state and trigger Outcome C (see §7)
- Successful submissions trigger the existing Prospect Carrier Outreach Email (24-hour delay)

### 6.5 What submission does NOT do

To be explicit:

- Does not auto-submit Type 2 / FCRA-regulated applications under any circumstances
- Does not pre-fill SSN, criminal history, drug/alcohol disclosures, MVR authorizations, or any FCRA-triggering field
- Does not sign anything on the driver's behalf
- Does not bypass CAPTCHA, anti-bot, or login walls
- Does not violate carrier site terms of service when those terms are clear

---

## 7. Outcome handling

When a driver picks a prospect carrier at Stage 2, three possible outcomes:

### 7.1 Outcome A — Type 1 submission successful

- Platform submitted the prequalification to the carrier's form/email
- Carrier received the lead
- Driver gets a confirmation email: "Your application was submitted to [Carrier]. They typically respond within X business days. Here's their contact info for follow-up."
- 24-hour delayed cold email goes to the carrier (existing Prospect Carrier Outreach Email)

### 7.2 Outcome B — Type 2 application required

- Platform identifies the carrier requires Tenstreet IntelliApp or equivalent
- Driver gets a deep-link email: "Complete your application for [Carrier]. This step takes about 15 minutes and requires your SSN and signature for background check authorization."
- Driver clicks through to the carrier's application
- 3-day IntelliApp completion follow-up sequence kicks in if driver doesn't finish (existing nurture)

### 7.3 Outcome C — Submission could not be completed

Several sub-cases:

- Application surface is `unknown` (not yet classified)
- Application surface is `custom_intake_form` but form schema doesn't exist yet (prospect carrier)
- Submission attempt failed after 3 retries
- Form blocked by anti-bot
- Form changed since last verification

In all of these, the driver gets an email:

> Subject: Apply directly to [Carrier]
>
> Hi [Driver],
>
> You picked [Carrier] from your match list. We tried to submit your application on your behalf but couldn't complete it this time.
>
> Here's how to apply directly:
>
> - **Careers page:** [carrier's careers URL]
> - **Phone:** [carrier's phone if known]
>
> They'll have the same information you provided to us. We'll keep monitoring for new opportunities and update you when we find more.
>
> — The CDLA.jobs team

The email is honest (didn't pretend it worked), actionable (gives the driver what they need), and non-blaming (doesn't make the driver feel bad about a system limitation).

### 7.4 Outcome tracking

Each submission attempt records:

- `submitted_at`
- `submission_status` (success / failed / inconclusive)
- `submission_method` (form / email / handoff_to_intelliapp)
- `failure_reason` (if failed: anti_bot, schema_mismatch, network_error, etc.)
- `driver_notified_at`

This data informs operational improvements — which carriers have the highest failure rates, what failure modes are most common, which carriers need their form schemas refreshed.

---

## 8. Re-verification and freshness

Job postings get stale. The pipeline re-verifies on these cadences:

- **Active jobs:** every 30 days, re-scrape the source URL; if job still listed, update `last_verified_at`; if not, mark `status = archived`
- **Recently archived jobs:** check 30 days after archive in case the carrier reposts
- **Application surfaces:** re-verify every 60 days for `custom_intake_form` jobs (the form may have changed); refresh schema if needed

Jobs older than 180 days without re-verification show as `verification_status = unverified` in match results, ranking lower but still appearing.

---

## 9. Operational implementation phases

The full ingestion pipeline is too large to build at once. Recommended phasing:

### Phase 1 — Foundation (launch readiness)

- Carrier discovery from FMCSA census + manual additions
- Basic LLM-based extraction of equipment, position title, location
- Application surface classification (rule-based: Tenstreet URL pattern detection only)
- Match results return `applicationSurface` field with fallback to "apply directly" for non-Tenstreet
- No automated Type 1 submission yet — even custom forms get the "apply directly" fallback

This is what's needed for partner-only launch with prospect carriers visible but not auto-submittable.

### Phase 2 — Submission for prioritized carriers (post-launch)

- Form schema authoring for top 10-20 prospect carriers (those generating most driver clicks)
- Custom form submission enabled for those carriers
- Outcome C fallback email for everything else
- Operational monitoring of submission success rates

### Phase 3 — Scaled submission (90+ days)

- LLM-assisted form schema generation for long-tail carriers
- Re-verification automation
- Driver-suggested carrier ingestion
- Performance optimization for high-volume submission queue

### Phase 4 — Continuous improvement (ongoing)

- Per-carrier handlers for problem cases
- Anti-bot evasion strategies (or capitulation to specific carriers)
- Application surface auto-detection improvements
- Driver feedback loop ("the application didn't go through — please apply directly")

This spec covers Phases 1 and 2. Phases 3 and 4 are future work.

---

## 10. Legal and compliance considerations

### 10.1 Attorney clearance gating

The submission pipeline (§6) cannot operate in production until the attorney clears the unsigned-prequalification submission mechanic. The discovery, extraction, classification, and Outcome C handling can operate without this clearance — they just don't result in actual submissions.

Practical product implication: the match results can show prospect carriers with their application surfaces classified, and drivers can click into them, but the actual submission step is gated. Until attorney clearance, all prospect carrier outcomes are effectively Outcome C ("apply directly").

### 10.2 Terms of Service compliance

Some carrier careers pages have terms prohibiting automated submission, scraping, or commercial use of their content. The ingestion pipeline must:

- Respect robots.txt
- Honor explicit "no scraping" terms when discoverable
- Not bypass authentication or access controls
- Not represent itself as a human when forms ask
- Flag carriers with explicit prohibitions for manual review

Attorney review of the discovery and submission mechanics for TOS exposure is part of the v2 addendum gating.

### 10.3 CFAA exposure

Automated form submission to systems you don't own has historical CFAA litigation. The mitigations:

- Per-driver explicit consent at Stage 2 (driver authorizes submission to specific named carrier)
- Public forms only, not behind login walls
- No data scraping beyond what's needed for application submission
- Clear logging of submission attempts for audit

Attorney review of CFAA posture is part of the v2 addendum gating.

### 10.4 Driver TCPA considerations

The Outcome C email and any submission failure notifications are transactional emails to the driver (not marketing nurture). They don't require separate TCPA consent — they're triggered by driver action and reasonably expected.

If submission failure notifications later expand to SMS, that requires TCPA opt-in (which the driver already provides at Stage 1 if they want SMS at all).

---

## 11. Open questions

### 11.1 Carrier opt-out mechanism

If a carrier doesn't want prospect submissions (they only want applications via Tenstreet, for example), how do they tell us?

Options:
- Email to `unsubscribe@cdla.jobs` mentioning their carrier name → manual deactivation
- A "carrier owners: claim this listing" page on CDLA.jobs → carrier authentication and self-service
- Treat the Prospect Carrier Outreach Email's unsubscribe as a full deactivation

Recommendation: start with the Prospect Carrier Outreach unsubscribe (already specced). Add a more formal carrier self-service path as a v2 feature.

### 11.2 LLM cost at scale

Extraction LLM costs scale with prospect carrier count and re-verification frequency. Rough math:

- 10,000 prospect carriers × ~3 jobs each × Claude Sonnet 4.6 extraction (~$0.05/extraction)
- = ~$1,500 for initial ingestion
- Re-verification every 30 days = ~$1,500/month thereafter
- Plus discovery costs (~$0.01 per carrier checked)

For 10K carriers monthly: ~$2,000 in LLM costs. Manageable but real. Could be reduced with Haiku for simpler extractions or batching.

### 11.3 Submission success rate definition

What counts as a "successful" submission for operational metrics?

- The form returned a success indicator → counted as success
- But the carrier may never respond to the driver → did the application actually work?

Recommendation: track both submission success (form-level) and downstream outcomes (did the driver hear back from the carrier within 30 days). Carriers with high submission success but zero responses signal that the carrier isn't engaging — operational flag.

### 11.4 Driver visibility into submission status

Should the driver see "your application is being submitted" / "submitted successfully" / "could not complete" in real time, or only via email?

Recommendation: both. Show a real-time status indicator on the match card after Stage 2 consent; send the appropriate outcome email when status resolves.

### 11.5 Multi-driver duplicate submissions

If 10 drivers all pick the same prospect carrier in one day, the carrier gets 10 prequalifications. That's correct behavior — each driver is a real lead.

But: if the same driver triggers a re-submission attempt (e.g., they Stage-2-consented twice), we should deduplicate within a 30-day window.

### 11.6 Prospect carrier "claim this listing" pathway

A prospect carrier who wants to convert to subscription has to engage sales. But the platform could include a "Is this your carrier? Claim it" link in the Prospect Carrier Outreach Email or on the public listing. This is a sales acquisition channel and is referenced in the Carrier Nurture Sequence as a future feature.

Recommendation: defer to v2. Operationally, sales should be the path until volume demands self-service.

---

## 12. What this document does not cover

- Specific LLM prompts for extraction (implementation detail)
- Per-carrier scraper code (operational implementation)
- The CAPTCHA / anti-bot evasion strategies (engineering implementation, evolves continuously)
- Specific tooling for form schema authoring (admin UI, separate spec)
- The Tenstreet integration for partner carriers (separate operational concern)
- The Outcome C email template details (transactional email spec)
- Match-event tracking (Core Technical Spec v5)
- The matching engine itself (Matching Engine Build Session Prompt v2)
- Application submission engine code (future build session)

---

## 13. Future build sessions this enables

This spec describes the system. Building it requires multiple future Claude Code build sessions:

- **Session: FMCSA Census Importer** — discovery from FMCSA bulk data
- **Session: LLM-based Job Extractor** — page scraping + Claude extraction + structured output
- **Session: Application Surface Classifier** — URL pattern + form structure heuristics
- **Session: Form Schema Authoring Tool** — admin UI for per-carrier schemas
- **Session: Submission Engine** — Type 1 form submission + email submission + outcome handling
- **Session: Re-verification Worker** — periodic re-scraping + freshness updates

None of these are blocking the v2 matching engine build. The matching engine reads from `carrier_jobs` regardless of how data got there. Partner carriers populate the table manually for launch; prospects populate via these future build sessions.

---

## 14. Change log

| Date | Change | By |
|------|--------|-----|
| 2026-05-21 | v1 created — DRAFT, gated on attorney clearance of unsigned-prequalification submission mechanic | Todd + Claude |

---

*End of spec.*
