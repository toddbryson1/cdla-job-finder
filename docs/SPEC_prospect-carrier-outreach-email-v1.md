# Prospect Carrier Outreach Email Spec — CDLA.jobs

**Version:** 1.0
**Status:** DRAFT — pending attorney clearance of the prequalification submission mechanic (see §2 and §7)
**Audience:** Internal — content, sales, product, engineering, GHL workflow build
**Owner:** Todd Bryson
**Companion documents:** Brand Voice Guide v1, Carrier Nurture Sequence Spec v1 (this email is Sequence A email 1), Carrier Landing Page Copy Spec v1, FMCSA Census Import Spec [STUB]

---

## 1. Purpose

This document specifies the **Prospect Carrier Outreach Email** — a single transactional cold email sent to FMCSA-seeded prospect carriers when a driver on CDLA.jobs selects them from a match list and submits a prequalification.

This email is **email 1 of Sequence A** in the Carrier Nurture Sequence Spec. After this email sends, the carrier enters the 12-email cold acquisition sequence unless they take an exit action (sign up, book a call, unsubscribe).

---

## 2. Strategic context

The email exists because of how the prospect carrier engine works:

- Non-partner, non-subscription carriers are seeded into CDLA.jobs from the FMCSA Motor Carrier Census plus public job posting data
- These carriers appear in driver match lists when public job posts align with driver preferences
- When a driver selects a prospect carrier at Stage 2, the driver's prequalification is submitted to whatever public application surface the carrier exposes (Tenstreet IntelliApp link from their job posting, native careers form, recruiter inbox, etc.)
- 24 hours after submission, this email goes to the carrier's listed contact, letting them know what happened and introducing CDLA.jobs

The carrier did not consent to be contacted by CDLA.jobs. They are a cold outreach recipient. The email's framing reflects this — it's an FYI tied to an action the driver took, not a sales pitch dressed up as an FYI.

The 24-hour delay is deliberate. Sending the email at the moment of submission would compete with the driver's actual application landing in the carrier's pipeline. The delay lets the application register first; the email arrives the next business day as context.

---

## 3. The legal dependency I'm flagging upfront

The original attorney brief took off the table "auto-submitting applications on behalf of drivers." That decision was made in the context of *signed IntelliApp* applications, where the signature authorizes FCRA-regulated background checks and DOT 391 application actions.

The prospect carrier flow specified here is **structurally different** in that it submits an *unsigned prequalification* — driver-provided data only, no FCRA-triggering authorizations, no signed releases. The carrier handles all the FCRA / DOT 391 work in their own process after receiving the lead.

Whether this distinction is legally adequate is **not a determination this document can make**. The attorney brief addendum's per-carrier consent question (Q4) and cross-entity data flow question (Q6) bear directly on this. **This email and the prospect carrier flow underneath it cannot go into production until the attorney clears the unsigned-prequalification-to-public-form mechanic.**

If the attorney determines auto-submission to public application forms is not legally safe regardless of signature status, this entire spec is moot — the email would need to be rewritten as an introduction-only ("a driver wants to apply to your job; here's how to talk to them") rather than an FYI-after-submission.

This dependency is flagged at the top of the spec because the rest of the document assumes attorney clearance. If clearance doesn't come, the spec needs a v2.

---

## 4. When the email sends

### 4.1 Trigger

- Driver completes Stage 2 qualifying for a prospect carrier
- Driver's prequalification submission to the carrier's public application surface succeeds (the submission API/scraper/email returns success)
- 24 business hours elapse from the submission timestamp, adjusted to the carrier's headquarters timezone and business days

### 4.2 Business-hours timing

A driver who submits at 3pm on Friday triggers an email scheduled for Monday at ~10am carrier timezone (the next business day at standard B2B open-rate window). A driver who submits at 3pm on Tuesday triggers an email scheduled for Wednesday at ~10am carrier timezone.

Carrier timezone is determined from the FMCSA-listed business address. If unresolvable, default to Central Time as a US national midpoint.

### 4.3 Suppression rules

The email does **not** send if:

- The carrier has previously unsubscribed (their email is on the suppression list)
- The carrier is already an active Tier 1 or Tier 2 subscriber (they're not a prospect anymore; different sequence applies)
- The carrier has received this same email within the last 30 days (cap to prevent driver-volume-driven spam — if 5 drivers all match the same prospect carrier in one week, the carrier gets one introduction email, not five)

### 4.4 Multi-driver collapse

If a driver submits to the same prospect carrier as another driver within the 24-hour delay window, the email collapses both into one. The 30-day suppression then prevents follow-up cold emails until the window resets.

The 12-email Sequence A continues from email 2 regardless — once a carrier is in Sequence A, the nurture cadence runs on its own clock.

---

## 5. Email content

### 5.1 Subject line

> A driver applied to your [region] CDL-A job

**Variables:**
- `region` — derived from the carrier's job posting region (city, state, or general region depending on what the job posting specified)

**Alternate A/B variants:**

- A: "A driver applied to your [region] CDL-A job" (current)
- B: "CDL-A driver match — [region]"
- C: "Heads up — driver inbound for your [equipment] role"

Recommendation: ship Variant A as the v1 default. A/B/C test once volume is sufficient (likely months out — prospect outreach is naturally lower-volume than driver-facing emails).

### 5.2 Preview text

> A quick context note on a driver who came in through CDLA.jobs.

### 5.3 Body

> Hi —
>
> A CDL-A driver applied to your [job_title or "CDL-A position"] in [region] yesterday through CDLA.jobs. Their application should be in your normal pipeline already.
>
> Heads up on who we are, since this is probably the first you're hearing of us:
>
> CDLA.jobs is a CDL-A driver matching platform. Drivers complete one intake with us, pick which carriers they want to share their info with, and we route their application to your existing process — we don't replace your ATS, we feed it. No per-lead fees, no per-hire fees, no signup required to receive these.
>
> If you want to keep getting these leads cleanly, the integration page explains how Tier 2 (free) works. If you'd rather we stop, hit unsubscribe below and we'll suppress your address from future emails.
>
> [Button: See how this works] → /partners/integration
>
> — The CDLA.jobs team

**Word count:** ~110 words (target 100-130 per spec design).

### 5.4 Variables required

| Variable | Source | Fallback if unresolvable |
|----------|--------|--------------------------|
| `region` | Carrier's job posting region | "your area" |
| `job_title` | Job posting title scraped from the public posting | "CDL-A position" |

### 5.5 What the email deliberately does *not* say

- It does not name the driver (the driver's PII isn't surfaced in cold outreach to a cold prospect; the carrier sees the driver's data in their application pipeline already)
- It does not describe how the application was submitted (channel-agnostic; the engineering layer handles the actual submission mechanism, which varies per carrier)
- It does not claim the driver "specifically chose" the carrier (the driver chose from a match list; "applied through CDLA.jobs" is accurate without overclaiming)
- It does not pitch Tier 1 (this is email 1 of a 12-email sequence; Tier 1 introduction is email 9)
- It does not include pricing tables, feature lists, or marketing imagery
- It does not include any consent or authorization language (the carrier didn't consent to be contacted; we're acknowledging that with brevity and an easy unsubscribe)

### 5.6 Footer

Standard CDLA.jobs email footer, plus a clear unsubscribe link. Required footer elements:

- One-line CDLA.jobs description
- Physical address (per CAN-SPAM)
- Unsubscribe link (one-click)
- "Why am I receiving this?" link → short explanatory page (see §6)

---

## 6. "Why am I receiving this?" page

CAN-SPAM compliance requires a clear sender identity, but cold outreach also benefits from an explanation page for recipients who want to understand the source. The footer's "Why am I receiving this?" link goes to a brief page that explains:

- CDLA.jobs is a CDL-A driver matching platform
- The recipient was contacted because their carrier is listed in the FMCSA Motor Carrier Census and has public job postings online
- A driver on CDLA.jobs selected the carrier from their match list and submitted an application
- The recipient can unsubscribe to stop future emails, and the suppression is permanent unless they explicitly opt back in
- Contact information for questions

**Page copy** (placeholder for design; the body is the spec):

> ## Why you received this email
>
> CDLA.jobs is a CDL-A driver matching platform. We connect CDL-A drivers to carriers actively hiring in their region and equipment type.
>
> Your carrier is listed in the FMCSA Motor Carrier Census, and we identified a public CDL-A job posting from your operation. When a driver on CDLA.jobs selects your carrier from their match list and submits an application, we send a one-time introduction email so you know the lead came through us.
>
> We don't sell driver contact info. The driver chose to apply to your job; their information went to your existing pipeline. This email is the heads-up.
>
> If you don't want to receive these:
>
> - Click unsubscribe in any CDLA.jobs email
> - Or email unsubscribe@cdla.jobs
>
> Suppression is permanent unless you explicitly opt back in.
>
> Questions? Email hello@cdla.jobs.

---

## 7. Open questions

### 7.1 Attorney clearance of unsigned-prequalification submission

The entire flow depends on attorney clearance that submitting an unsigned prequalification (driver-provided data only, no signed authorizations) to a carrier's public application surface is legally safe. Per §3, this is the gating dependency. Until cleared, the spec is DRAFT and the flow does not run in production.

### 7.2 Submission mechanism variance

The "submitted to your public application form" framing is channel-agnostic in the email copy. The engineering layer handles the actual submission, which varies per carrier:

- Tenstreet IntelliApp deep link → automated form fill or driver-completed
- Native careers page → form scrape + submit, or driver redirect to complete on carrier's site
- Email-only inbox → email send with the prequalification record formatted as text/PDF
- No public application mechanism → submission fails; email does not send

The submission mechanism per carrier is determined during FMCSA census ingestion. The downstream success/failure status drives whether this email triggers.

### 7.3 Submission failures

When the submission can't complete (carrier has no public form, scraping fails, email inbox bounces, etc.), what happens to the driver?

Two paths:
- **Driver sees a failure state** ("we couldn't reach this carrier directly; here's how to apply with them yourself") with the carrier's contact info from FMCSA
- **Driver doesn't see this carrier in matches at all** (filter out carriers with no submission path)

Recommendation: filter out at the matching layer. Drivers shouldn't pick a carrier we can't actually reach. Spec belongs in the matching engine documentation, not here. Flagged for visibility.

### 7.4 30-day suppression window appropriateness

§4.3 sets a 30-day window where re-receiving this email is suppressed. Is 30 days the right cap?

- Too short → carrier gets multiple introduction emails as multiple drivers apply, feels like spam
- Too long → carrier doesn't get re-notified for months even if they signed up for Tier 2 elsewhere

Recommendation: 30 days for v1. Monitor unsubscribe rate per send; if drivers complain (multi-driver collapse working as expected), tighten. If carriers complain about repeated contact, widen.

### 7.5 The 24-hour delay value

Why specifically 24 hours? Two reasons in the design:

- Lets the actual application register in the carrier's pipeline first, so the email is context for something they already see
- Sends the email at a predictable time (next business day morning) rather than competing with the driver's submission moment

If the carrier's submission mechanism is delayed (their Tenstreet pipeline takes hours to populate, their email inbox isn't checked daily), 24 hours may not be long enough. Worth measuring open-and-engagement rate vs. the 24-hour assumption post-launch.

### 7.6 Sender identity / FROM address

The email sends from CDLA.jobs but the specific FROM address matters for deliverability and tone. Options:

- `outreach@cdla.jobs` — clearly marketing-tone
- `hello@cdla.jobs` — friendlier
- `team@cdla.jobs` — vaguely human
- A real person's name (Todd, sales rep, etc.) → personal-looking, higher open rate, but creates a 1:1 reply expectation that scales poorly

Recommendation: `hello@cdla.jobs` for v1. Replies go to a shared inbox handled by sales. Real-person FROM addresses introduce too many side effects (people reply with detailed questions; the named person has to respond personally; vacation coverage breaks the model). Open as a v2 experiment if data supports it.

---

## 8. Open questions for attorney review

### 8.1 The core question

Can CDLA.jobs submit an unsigned prequalification on a driver's behalf to a carrier's public application surface, given Stage 2 per-carrier consent from the driver? See Attorney Brief Addendum v1 Questions 4 and 6. This is the gating dependency for the entire prospect carrier flow.

### 8.2 CAN-SPAM compliance

The email is cold outreach to a recipient who didn't consent. CAN-SPAM allows this with proper sender identification, accurate subject line, physical address, and one-click unsubscribe. The spec includes all four. Confirm the implementation matches the spec, and confirm there are no state-specific commercial email statutes (California has stricter requirements; some states track to federal CAN-SPAM) that affect anything.

### 8.3 The "driver chose your carrier" framing

The email says "A CDL-A driver applied to your [job] in [region] yesterday through CDLA.jobs." This implies driver-initiated action, which is accurate (the driver picked the carrier from a match list and consented at Stage 2). Is this framing legally adequate to characterize the source of the lead, or does it need to be more explicit about CDLA.jobs's role?

### 8.4 Suppression and the 12-email sequence

If a carrier unsubscribes from this email, do they suppress only this email type, or all CDLA.jobs marketing? §4.3 currently treats unsubscribe as a permanent address suppression — the carrier doesn't enter Sequence A. Confirm this matches CAN-SPAM and any state law expectations for B2B cold outreach unsubscribe.

---

## 9. What this document does not cover

- The Sequence A 12-email cadence after this email (covered in Carrier Nurture Sequence Spec)
- The FMCSA census ingestion mechanics (separate spec — STUB)
- The matching engine logic for surfacing prospect carriers to drivers (covered in Matching Engine Field Schema v2 and Core Technical Spec v5)
- The actual submission mechanism for each carrier type (engineering implementation, not content)
- Email template HTML / design (design phase, not copy)
- The "Why am I receiving this?" page design (only copy specified here)
- Carrier-side webhook or API for accepting matched leads (Core Technical Spec v5)

---

## 10. Change log

| Date | Change | By |
|------|--------|-----|
| 2026-05-19 | v1 DRAFT — pending attorney clearance | Todd + Claude |

---

*End of spec.*
