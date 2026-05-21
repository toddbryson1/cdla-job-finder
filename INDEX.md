# CDLA.jobs Project Index

**Last updated:** 2026-05-19
**Maintainer:** Todd Bryson
**Purpose:** Authoritative map of all spec, data, and build documents for the CDLA.jobs and Powerhouse Trucking Pros (PHTP) workstream. This file is the first document any new chat session or Claude Code session should reference.

---

## How to read this index

- **Status legend:**
  - `LOCKED` — Finalized, current version, safe to reference and build against
  - `DRAFT` — In progress, not yet ready for production reference
  - `STUB` — Placeholder; needs to be written
  - `PENDING REVIEW` — Drafted, awaiting attorney or stakeholder review before locking
- **File naming convention:**
  - `SPEC_*` — Locked product/legal/technical specifications
  - `DATA_*` — Working databases and reference spreadsheets
  - `BUILD_*` — Build session prompts, stack decisions, deployment instructions
- **Versioning:** Document versions bump on material change. The current version is suffixed in the filename. Old versions are archived, not deleted.

---

## Project context

- **Company:** Powerhouse Trucking Pros (PHTP) is building CDLA.jobs as a fully separate consumer brand
- **Brand rule:** PHTP must remain invisible to drivers and carriers interacting with CDLA.jobs
- **Domain:** `cdla.jobs` (.jobs TLD confirmed)
- **Product model:** Two-sided CDL-A driver matching marketplace with conversational AI intake (Debbie). Drivers complete one intake; carriers receive matched pre-qualified driver leads.
- **Carrier commercial models:**
  - Tier 1 ($2,500/month flat): exclusivity subscription with 24-hour first-look on matched drivers
  - Tier 2 (free): email delivery of matched driver leads
  - Tenstreet ATS integration: free quality upgrade, tier-independent
  - PHTP referral partners (20 carriers): per-hire bounty paid to PHTP, surfaced on CDLA.jobs alongside Tier 1/Tier 2 carriers
- **Legal architecture:** Prequalification submission model. CDLA.jobs submits unsigned prequalification data to carriers; carriers handle all FCRA-regulated authorizations and DOT 391 application requirements directly with drivers inside the carrier's own ATS.
- **Prospect carrier engine:** Non-partner carriers seeded from FMCSA Motor Carrier Census; appear in driver matches when public job posts align with driver preferences.

---

## Tier 1 — Foundation Specs

| # | Document | Filename | Status | Notes |
|---|----------|----------|--------|-------|
| 1 | Project Index | `INDEX.md` | LOCKED | This file |
| 2 | Brand Voice Guide | `SPEC_brand-voice-guide-v1.md` | LOCKED | Driver-facing and carrier-facing tone rules; Debbie persona |
| 3 | Core Technical Spec | `SPEC_core-technical-spec-v5.md` | STUB | Architecture, data model, integrations. Supersedes v4. |
| 4 | Attorney Brief | `SPEC_attorney-brief-v1.md` | STUB | TCPA, FCRA, per-carrier consent, state privacy law, paid placement disclosure |

---

## Tier 2 — Driver Experience Specs

| # | Document | Filename | Status | Notes |
|---|----------|----------|--------|-------|
| 5 | Driver Intake Form (Fallback) | `SPEC_driver-intake-form-fallback-v1.md` | STUB | The 6-step structured form; secondary path for drivers who skip the chat |
| 6 | Conversational AI Intake (Debbie) | `SPEC_conversational-ai-intake-v1.md` | LOCKED | Primary intake; two-stage progressive disclosure; produced 2026-05-19 |
| 7 | Driver Landing Page Template | `SPEC_driver-landing-page-template-v1.docx` | LOCKED | Variable-driven region/equipment landing pages |
| 8 | Carrier Landing Page Copy | `SPEC_carrier-landing-page-copy-v1.md` | STUB | `/partners/integration` and `/partners/exclusivity` |

---

## Tier 3 — Content Specs

| # | Document | Filename | Status | Notes |
|---|----------|----------|--------|-------|
| 9 | Candidate Email Template | `SPEC_candidate-email-template-v1.md` | STUB | 3 A/B subject line variants; transactional |
| 10 | Reverse-Match Alert Templates | `SPEC_reverse-match-alert-templates-v1.md` | STUB | Email + SMS; carrier name withheld until driver click-through |
| 11 | Driver Nurture Sequence | `SPEC_driver-nurture-sequence-v1.md` | STUB | Monthly active; 6-month post-hire pause; monthly resume |
| 12 | Carrier Nurture Sequence (12-month) | `SPEC_carrier-nurture-sequence-v1.md` | STUB | 12 emails for carrier acquisition and upgrade |
| 13 | Prospect Carrier Outreach Email | `SPEC_prospect-carrier-outreach-email-v1.md` | STUB | 24-hour delayed cold email triggered by driver match |

---

## Tier 4 — Operations Specs

| # | Document | Filename | Status | Notes |
|---|----------|----------|--------|-------|
| 14 | GHL Workflow Specs | `SPEC_ghl-workflows-v1.md` | STUB | 10 workflows including inbound webhook keyword handling |
| 15 | Tenstreet Partner Confirmation Checklist | `SPEC_tenstreet-partner-confirmation-checklist-v1.md` | STUB | Fillable onboarding form for carrier-side configuration |
| 16 | FMCSA Census Import Spec | `SPEC_fmcsa-census-import-spec-v1.md` | STUB | Developer-facing import workflow for prospect carrier seed data |

---

## Tier 5 — Sales Specs (already produced as .docx)

| # | Document | Filename | Status | Notes |
|---|----------|----------|--------|-------|
| 17 | Carrier Pitch Deck Outline | `SPEC_carrier-pitch-deck-outline-v1.docx` | LOCKED | 13-slide deck for carrier sales conversations |
| 18 | Video Script Template | `SPEC_video-script-template-v1.docx` | LOCKED | Variable-driven short-form video scripts |

---

## Tier 6 — Working Data Files

| # | Document | Filename | Status | Notes |
|---|----------|----------|--------|-------|
| 19 | Prospect Carrier Database | `DATA_prospect-carriers.xlsx` | STUB | Seeded from FMCSA Motor Carrier Census |
| 20 | Partner Carrier Rules Database | `DATA_partner-carriers-rules.xlsx` | STUB | Hiring rules for the 20 PHTP-referral partner carriers |
| 21 | Regions × Equipment Grid | `DATA_regions-equipment-grid.xlsx` | STUB | Coverage analysis tool with formulas |

---

## Build Artifacts (created during code build phase)

| # | Document | Filename | Status | Notes |
|---|----------|----------|--------|-------|
| 22 | Stack Decisions | `BUILD_stack-decisions.md` | STUB | Locked architectural choices: framework, database, hosting, APIs |
| 23 | Session 1 Prompt: Foundation | `BUILD_session-01-foundation-prompt.md` | STUB | Claude Code prompt for repo scaffolding |
| 24 | Session 2 Prompt: Carrier Rules Database + Admin | `BUILD_session-02-carrier-rules-prompt.md` | STUB | |
| 25 | Session 3 Prompt: Matching Engine | `BUILD_session-03-matching-engine-prompt.md` | STUB | |
| 26 | Session 4 Prompt: Conversational Intake (Debbie) | `BUILD_session-04-intake-prompt.md` | STUB | Builds on `SPEC_conversational-ai-intake-v1.md` |
| 27 | Session 5 Prompt: Region/Equipment Landing Pages | `BUILD_session-05-landing-pages-prompt.md` | STUB | |
| 28 | Session 6 Prompt: Partner Carrier Job Board | `BUILD_session-06-job-board-prompt.md` | STUB | Scraping, JobPosting schema, Indexing API |
| 29 | Session 7 Prompt: Email + SMS Infrastructure | `BUILD_session-07-comms-prompt.md` | STUB | |
| 30 | Session 8 Prompt: GHL Integration | `BUILD_session-08-ghl-prompt.md` | STUB | |
| 31 | Session 9 Prompt: Carrier-Facing Portal | `BUILD_session-09-carrier-portal-prompt.md` | STUB | |

---

## Open questions to resolve before relevant downstream work

These are tracked here so they don't get lost. Each will be addressed in the appropriate Tier 1 spec when that document is built.

### For the attorney brief
- Stage 1 single-consent language authorizing matching, storage, multichannel nurture, audio processing, resume parsing
- Audio/biometric consent disclosure under Illinois BIPA, Texas CUBI, Washington biometric law
- Resume parsing disclosure adequacy in privacy policy
- Cross-entity data flow: CDLA.jobs → PHTP's Tenstreet account for partner carrier IntelliApps; whether consent must name PHTP or "affiliated referral partners" is adequate
- Paid placement disclosure (FTC + state UDAP) for "Featured Partner" labeling
- 12-month Stage 1 consent expiration cadence appropriateness
- Durable PII storage obligations under CCPA, VCDPA, CPA, and other state privacy laws
- 3-day IntelliApp completion follow-up TCPA coverage under per-carrier consent
- Termination-for-cause handling: confirm Debbie's expectation-setting language is not adverse action under FCRA
- Magic-link auth implications if email account is compromised

### For the technical spec v5
- Matching engine response time target (<2 sec assumed for instant match display; needs validation)
- Re-match cadence for zero-match drivers (daily, weekly, or event-driven)
- LLM confidence threshold for re-asking vs. confirming (0.85 proposed)
- Transcription service selection and data-handling agreement
- Resume parsing implementation: LLM-direct vs. dedicated parser API
- Conversation orchestrator architecture
- Tenstreet integration mechanism for IntelliApp completion status: webhook, polling, or time-based
- Form fallback rendering: modal in-chat or separate page
- Audio retention policy implementation alignment
- Magic-link auth: build vs. third-party (Stytch, Magic.link, Auth0)
- Returning-driver UX rendering ("previous matches + new since")
- Q6 fill rate / skip rate / drop-off post-launch measurement plan
- Q6 hard-filter fields vs. soft-rank fields in matching engine
- Email validation approach (format check only; no double-opt-in confirmed)

---

## Change log

| Date | Change | By |
|------|--------|-----|
| 2026-05-19 | Index created during document rebuild after document loss | Todd + Claude |
| 2026-05-19 | Brand Voice Guide v1 added | Todd + Claude |
| 2026-05-19 | Conversational AI Intake Spec v1 added (produced same session as index) | Todd + Claude |

---

*End of index.*
