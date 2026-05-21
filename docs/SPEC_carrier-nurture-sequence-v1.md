# Carrier Nurture Sequence Spec — CDLA.jobs

**Version:** 1.0
**Status:** Locked (pending sales operations alignment on CTA destinations and asset readiness)
**Audience:** Internal — content, sales, product, engineering, GHL workflow build
**Owner:** Todd Bryson
**Companion documents:** Brand Voice Guide v1, Carrier Landing Page Copy Spec v1, Carrier Pitch Deck Outline v1, Prospect Carrier Outreach Email Spec [STUB]

---

## 1. Purpose

This document specifies two carrier-facing nurture email sequences:

- **Sequence A — Cold acquisition** (12 emails over 12 months): for prospect carriers who have been introduced to CDLA.jobs but have not signed up
- **Sequence B — Tier 2 to Tier 1 upgrade** (6 emails over 6 months): for active Tier 2 subscription carriers, driving toward Tier 1 upgrade

Both sequences operate alongside but distinct from:

- The **Prospect Carrier Outreach Email** (separate spec) — a single transactional email triggered when a driver on CDLA.jobs matches a non-partner FMCSA-seeded carrier. This email is **email 1 of Sequence A**.
- The **Driver Nurture Sequence** (separate spec) — driver-facing nurture, no overlap with carrier nurture.

---

## 2. Strategic context

Carrier acquisition is the slower side of the marketplace. Drivers complete intake in 5 minutes; carriers evaluate a vendor for weeks or months. The cold acquisition sequence is the patient counter to that — useful content, modest asks, no high-pressure framing.

The Tier 2 upgrade sequence is different. Tier 2 carriers already trust CDLA.jobs enough to use the free tier. The pitch is about whether priority placement and the 24-hour exclusivity window are worth $2,500/month to them — a data-driven conversation, not an introduction.

Both sequences follow the **carrier-facing brand voice** (Brand Voice Guide §4): professional, credible, specific. No sarcasm, no buzzwords, prices visible. The reader is a recruiting director or hiring manager who reads marketing emails skeptically and is faster to unsubscribe than to engage.

---

## 3. Audience and segmentation

### 3.1 Sequence A audience

A carrier enters Sequence A when:

- A driver on CDLA.jobs has matched the carrier's public job posting (FMCSA-seeded prospect), triggering the Prospect Carrier Outreach Email (email 1), OR
- A carrier contact has been manually added by sales (e.g., from a tradeshow, referral, or outbound list), OR
- A carrier has downloaded an asset (pitch deck PDF, etc.) but not engaged with sales

### 3.2 Sequence A exit conditions

A carrier exits Sequence A when any of:

- Carrier books a sales call → moved to a 1:1 sales follow-up sequence (out of scope here)
- Carrier signs up for Tier 2 (free) → moved to Sequence B (upgrade nurture) after a 60-day onboarding pause
- Carrier signs up for Tier 1 → moved to a separate Tier 1 retention nurture (out of scope here)
- Carrier unsubscribes
- 12 months elapse without any of the above → carrier moves to a dormant state (one quarterly email per quarter; out of scope of this doc)

### 3.3 Sequence B audience

A carrier enters Sequence B when:

- Carrier signs up for Tier 2 and completes onboarding (Tenstreet integration if applicable)
- 60 days pass after Tier 2 onboarding (the "earned engagement" window — see §3.5)

### 3.4 Sequence B exit conditions

A carrier exits Sequence B when:

- Carrier upgrades to Tier 1 → moved to Tier 1 retention nurture (out of scope)
- Carrier downgrades from Tier 2 (cancels) → moved to a brief win-back sequence (out of scope)
- Carrier unsubscribes from nurture (Tier 2 service continues; only nurture stops)
- 6 months elapse without upgrade → carrier moves to a slower maintenance cadence (quarterly emails)

### 3.5 The 60-day "earned engagement" window

Tier 2 carriers are deliberately not pushed to upgrade during their first 60 days. Reason: carriers in the first 60 days are still evaluating whether the free tier delivers what they need. Pushing for upgrade before they've experienced value is the fastest way to lose them entirely.

The 60-day window also gives match volume time to accumulate, which makes the data-driven upgrade pitch (Sequence B) actually defensible — by month 3 we can show the carrier "you've seen X matches in 60 days at Tier 2; at Tier 1 you'd have seen them 24 hours earlier and had Y priority placements." That conversation only works if the data exists.

---

## 4. Sequence A — Cold acquisition (12 emails)

### 4.1 Cadence

Front-loaded. Heavy in the first month while interest is fresh, tapering after.

| Email | Day from entry |
|-------|----------------|
| Email 1 | Day 1 (the Prospect Carrier Outreach Email — see separate spec) |
| Email 2 | Day 7 |
| Email 3 | Day 14 |
| Email 4 | Day 28 |
| Email 5 | Day 56 (Month 2) |
| Email 6 | Day 84 (Month 3) |
| Email 7 | Day 112 (Month 4) |
| Email 8 | Day 140 (Month 5) |
| Email 9 | Day 180 (Month 6) |
| Email 10 | Day 240 (Month 8) |
| Email 11 | Day 300 (Month 10) |
| Email 12 | Day 365 (Month 12) |

### 4.2 Email purpose map

| Email | Purpose | Primary CTA |
|-------|---------|-------------|
| 1 | Introduction (separate spec) | Talk to sales / book a call |
| 2 | The model explained | Read the carrier brief PDF |
| 3 | Cost transparency | Read the integration page |
| 4 | First case-shaped value email | Talk to sales |
| 5 | Industry data / pay benchmarks | Read the data |
| 6 | Tenstreet integration deep-dive | Book a 30-min integration call |
| 7 | Objection handling — "we already have leads" | Talk to sales |
| 8 | Comparison — "how CDLA.jobs is different from lead vendors" | Read the comparison |
| 9 | Tier 1 introduction | Schedule a Tier 1 call |
| 10 | Cost-of-vacant-seats argument | Talk to sales |
| 11 | Soft re-engagement | Update your interest level |
| 12 | Final touch + dormant state pivot | One-click "I'm still interested" |

### 4.3 Email 1 — Introduction (Prospect Carrier Outreach Email)

Specified in `SPEC_prospect-carrier-outreach-email-v1.md` (STUB at time of writing). Not duplicated here.

### 4.4 Email 2 — Day 7 — The model explained

**Subject A:** How CDLA.jobs actually works
**Subject B:** A different model for CDL-A driver hiring

**Body:**

> Hi [first_name] —
>
> Quick follow-up on the introduction you got last week. Wanted to give you a clearer picture of how CDLA.jobs actually works, because the model is different enough from lead vendors that the difference matters.
>
> **What drivers do:**
> Complete one intake on CDLA.jobs. We capture their experience, equipment, regions, schedule preference, and safety history.
>
> **What our matching engine does:**
> Runs each driver's profile against your stated hiring criteria. Driver only sees you in their match list if your criteria fit them and their disclosures fit you.
>
> **What you do:**
> Receive matched driver prequalifications in your Tenstreet account (or by email if you're not on Tenstreet). Run your normal DOT 391 application. Hire who you want to hire.
>
> **What we don't do:**
> Background checks. MVR pulls. Hiring decisions. FCRA-touched workflows. All of that stays inside your existing process — by design.
>
> Full detail in our carrier brief.
>
> [Button: Download the carrier brief (PDF)] → pitch deck PDF
> [Button: Talk to sales] → calendar booking
>
> — The CDLA.jobs team

**Variables:** `first_name`, `carrier_name`

### 4.5 Email 3 — Day 14 — Cost transparency

**Subject A:** What CDLA.jobs actually costs
**Subject B:** No per-hire fees, ever — here's why

**Body:**

> Hi [first_name] —
>
> Most carrier-side platforms charge per-lead, per-hire, or both. We don't. Worth explaining why.
>
> **Per-lead fees** create a perverse incentive — the platform wants to send you as many leads as possible whether they fit your criteria or not. We get paid the same whether we send you 5 matches or 50, so we only send matches that actually fit.
>
> **Per-hire fees** punish carriers for using the platform successfully. The carriers who hire most pay most, even though they got the same lead from the same source as someone who didn't hire. We charge a flat subscription so cost is predictable.
>
> **What this means for you:**
>
> | Tier | Monthly | Setup | Per-lead | Per-hire |
> |------|---------|-------|----------|----------|
> | Tier 2 (matched leads) | $0 | $0 | $0 | $0 |
> | Tier 1 (24hr exclusivity) | $2,500 flat | $0 | $0 | $0 |
>
> Tier 2 is genuinely free. We make our money on Tier 1 subscriptions from carriers who want priority placement.
>
> [Button: See the integration page] → /partners/integration
> [Button: Talk to sales] → calendar booking
>
> — The CDLA.jobs team

**Variables:** `first_name`

### 4.6 Email 4 — Day 28 — First value-shaped email

**Subject A:** [region] CDL-A market — what we're seeing
**Subject B:** Where CDL-A drivers in [region] are looking

**Body:**

> Hi [first_name] —
>
> A look at what's happening with CDL-A drivers in [region] based on intake data from the last 90 days. [Region-specific intake counts and equipment mix only if data exists; otherwise omit and substitute "Quick read on the CDL-A hiring market generally."]
>
> [If region-specific data exists:]
>
> **Drivers who completed intake in [region]:** [region_intake_count_90d]
> **Top equipment they want to drive:** [top_3_equipment]
> **Home time preferences:**
> - Daily home: [pct_daily]%
> - Weekly home: [pct_weekly]%
> - OTR (2+ weeks out): [pct_otr]%
>
> [If carrier hires for equipment in top 3 and has matching region]:
> You're hiring for [carrier_equipment] in [region]. Based on intake patterns, that's [a strong / a moderate / a tough] match against the driver pool — there are [estimated number] active drivers in your matching profile right now.
>
> [Always:]
> If this data is useful, the kind of detail you'd get on a sales call is several layers deeper — actual match counts against your specific criteria, pay distribution, supply/demand trends in your lanes.
>
> [Button: Schedule a 30-minute working session] → calendar booking
>
> — The CDLA.jobs team

**Variables:** `first_name`, `region`, `region_intake_count_90d`, `top_3_equipment`, `pct_daily`, `pct_weekly`, `pct_otr`, `carrier_equipment`

**Fallback:** if region-specific data doesn't exist (early beta, sparse region), substitute a shorter generic email about industry hiring trends with the same CTA.

### 4.7 Email 5 — Day 56 — Pay benchmarks

**Subject A:** [region] CDL-A pay — real numbers
**Subject B:** What carriers are paying for CDL-A in [region]

**Body:**

> Hi [first_name] —
>
> Quarterly pay benchmark for CDL-A drivers in [region], pulled from carriers actively hiring through CDLA.jobs. Not industry-survey data — actual matched-driver pay ranges.
>
> [If pay data exists:]
>
> **Weekly pay range for CDL-A in [region]:**
> - Median: $[pay_median]
> - Top quartile: $[pay_top_25_threshold]+
> - Bottom quartile: $[pay_bottom_25_threshold] or less
>
> **By equipment:**
> [List 2-3 of the carrier's hiring equipment with median pay if data exists; omit any without data.]
>
> Drivers are aware of these ranges. They see them at intake. If your offered pay is meaningfully below median, expect your match-to-application conversion to be lower than average. If it's at or above median, the matching engine will weight you favorably.
>
> [Button: See where you'd land vs. the market — talk to sales] → calendar booking
>
> — The CDLA.jobs team

**Variables:** `first_name`, `region`, `pay_median`, `pay_top_25_threshold`, `pay_bottom_25_threshold`, plus equipment-specific pay variables if data exists.

**Fallback:** if pay data is too sparse to publish (early beta), skip this email entirely and shift the cadence forward — Email 6 sends at day 56 instead.

### 4.8 Email 6 — Day 84 — Tenstreet integration deep-dive

**Subject A:** Tenstreet integration — what's actually involved
**Subject B:** How CDLA.jobs feeds your Tenstreet pipeline

**Body:**

> Hi [first_name] —
>
> Quick walk through the Tenstreet integration for carriers evaluating CDLA.jobs.
>
> **What you're integrating:** matched driver prequalifications land directly in your Tenstreet pipeline as if the driver had completed an application on your careers page. Same lead, less friction.
>
> **What we need from you:** an integration approval through Tenstreet's partner portal. Your account team handles this — typical lift is one or two approvals over the course of a business week.
>
> **What we handle:** all the configuration work, the field mapping between our schema and your Tenstreet workflow, and the test lead before you go live.
>
> **What it costs:** zero. Setup is free, monthly integration is free. There's no per-lead-from-integration fee. The integration is included at both Tier 2 (free) and Tier 1 ($2,500/month).
>
> **Typical timeline from kickoff to live leads:** 5-7 business days.
>
> If you're already on Tenstreet, this is the lowest-friction path to evaluate whether CDLA.jobs matched leads convert in your pipeline. If you're not on Tenstreet, leads can be delivered by email instead — slightly more friction on your side but the matching is identical.
>
> [Button: Schedule a 30-minute integration call] → calendar booking
>
> — The CDLA.jobs team

**Variables:** `first_name`

### 4.9 Email 7 — Day 112 — Objection: "we already have leads"

**Subject A:** "We already have plenty of leads"
**Subject B:** When you're not lead-short — what CDLA.jobs is for

**Body:**

> Hi [first_name] —
>
> A pattern we hear from recruiting directors evaluating CDLA.jobs: "We already get plenty of leads. We don't need more."
>
> Fair. Most established carriers have a steady lead flow from a mix of sources — Indeed, lead vendors, referrals, their own careers page, agency partners.
>
> The question CDLA.jobs is actually answering isn't "do you need more leads?" It's:
>
> **"Of the leads you're currently getting, how many actually qualify for your criteria?"**
>
> For most carriers we talk to, the answer is something like 10-30%. The other 70-90% wash out — wrong equipment experience, wrong region, can't pass the safety screen, won't accept the pay, want a different schedule.
>
> CDLA.jobs filters that out upstream. Drivers only see you in their match list if your criteria fit them and their disclosures fit you. Your team's screening time goes to applicants who could actually qualify.
>
> If your current lead volume is wrong but right-volume, more leads doesn't help. Fewer but more-qualified does.
>
> [Button: See how this works in practice — talk to sales] → calendar booking
>
> — The CDLA.jobs team

**Variables:** `first_name`

### 4.10 Email 8 — Day 140 — Comparison vs. lead vendors

**Subject A:** CDLA.jobs vs. lead vendors — the actual difference
**Subject B:** Why we don't sell driver contact lists

**Body:**

> Hi [first_name] —
>
> Recruiting directors often ask how CDLA.jobs is different from lead vendors like [unnamed competitor patterns]. The differences matter for compliance and conversion both.
>
> **Lead vendor model:**
> - Driver fills out a form that sells their contact info to multiple carriers
> - Driver doesn't know which carriers will get their info
> - Driver gets called by 5-15 carriers in rapid sequence
> - Most calls go unanswered or get hung up on
> - Conversion is low because driver feels spammed
>
> **CDLA.jobs model:**
> - Driver completes one intake, sees their match list
> - Driver explicitly selects which carriers see their prequalification
> - Carrier receives a prequalification from a driver who *chose them*
> - First touch is from the carrier, not the platform, and the driver is expecting it
> - Conversion is higher because driver opted in to that specific conversation
>
> The second model also avoids the TCPA exposure that comes with selling contact info to multiple carriers without driver authorization. Every driver consents per-carrier specifically — what we send to you, the driver agreed to send to you.
>
> [Button: Read the carrier brief (PDF)] → pitch deck PDF
> [Button: Talk to sales] → calendar booking
>
> — The CDLA.jobs team

**Variables:** `first_name`

### 4.11 Email 9 — Day 180 — Tier 1 introduction

**Subject A:** When 24-hour exclusivity is worth it
**Subject B:** How Tier 1 works — and when it pays off

**Body:**

> Hi [first_name] —
>
> Six months in on the nurture. If you've gotten this far, you've seen the basics. Worth introducing Tier 1 properly.
>
> **What Tier 1 gets you:**
>
> - **24-hour exclusivity window** on every driver matching your criteria — you see them first, before other carriers
> - **Priority placement** in driver match lists — when a driver sees their matches, Tier 1 carriers appear first
> - **Quarterly business reviews** — working session with your account contact reviewing match volume, conversion data, criteria refinement
>
> **Cost:** $2,500/month flat. No setup, no per-hire, no contract length. 30-day notice to cancel.
>
> **When Tier 1 is worth it:**
> - You hire enough volume that 24 hours of head start materially affects fill rate
> - You're competing for the same drivers as other carriers in your region
> - Your recruiting team has bandwidth to act on first-look leads within the window
>
> **When Tier 1 isn't worth it:**
> - You hire low volume and don't need urgency
> - Tier 2 (free) is meeting your need
> - Your team isn't sized to act on time-sensitive leads
>
> We'll tell you which one applies to your operation in a 45-minute call.
>
> [Button: Schedule a Tier 1 call] → calendar booking
> [Button: See the exclusivity page] → /partners/exclusivity
>
> — The CDLA.jobs team

**Variables:** `first_name`

### 4.12 Email 10 — Day 240 — Cost of vacant seats

**Subject A:** What an empty seat actually costs
**Subject B:** Cost-of-vacancy math for CDL-A fleets

**Body:**

> Hi [first_name] —
>
> Carriers tend to evaluate hiring vendors on cost per hire. Worth flipping that — cost per *day* of vacancy.
>
> Standard industry math (verify against your own numbers):
>
> - **Revenue per truck per week, OTR dry van:** $4,000–$7,000 depending on lane and pay structure
> - **Driver weekly cost (pay + benefits + overhead):** $1,500–$2,500
> - **Gross margin per truck per week:** $2,000–$5,000
>
> Every week a seat sits empty, that margin is gone. For a 100-truck fleet running 5% vacancy at any given time, that's roughly $10,000–$25,000 per week in foregone margin.
>
> Most hiring decisions optimize "cost per hire" — the recruiter spent X dollars getting this driver in the seat. CDLA.jobs optimizes "days to fill" — how fast can a qualified driver be in the seat.
>
> A platform that reduces time-to-fill by 5 days, for a 100-truck fleet, recovers something like $7,000–$17,000 per filled seat in foregone-margin alone. Independent of any per-hire cost difference.
>
> The numbers above are illustrative. The real conversation is your numbers against your current sourcing speed.
>
> [Button: Run the math on your fleet — talk to sales] → calendar booking
>
> — The CDLA.jobs team

**Variables:** `first_name`

### 4.13 Email 11 — Day 300 — Soft re-engagement

**Subject A:** Should we keep talking?
**Subject B:** Where we stand — honest read

**Body:**

> Hi [first_name] —
>
> Honest check: 10 months of CDLA.jobs nurture in your inbox. If you've been reading, we appreciate it. If you've been ignoring, we get it.
>
> Three things you might do:
>
> 1. **Start with Tier 2 (free).** No commitment, no setup cost, matched driver prequalifications start flowing to your Tenstreet within a week. Most carriers who become customers do this first to validate the matching before considering Tier 1.
>
> [Button: Start Tier 2] → calendar booking with "Tier 2 onboarding" subject
>
> 2. **Tell us what's blocking you.** If there's a specific reason CDLA.jobs isn't a fit — wrong region, wrong tier model, wrong timing — we'd want to know. Reply to this email; it's a real inbox.
>
> 3. **Unsubscribe.** If we're not useful and won't be, no problem. Hit unsubscribe below and we'll wrap up cleanly.
>
> No fake urgency, no "limited time," no fourth bullet. Those three options cover it.
>
> — The CDLA.jobs team

**Variables:** `first_name`

### 4.14 Email 12 — Day 365 — Final touch + dormant pivot

**Subject A:** Wrapping up — one click if you're still interested
**Subject B:** Last note for now

**Body:**

> Hi [first_name] —
>
> A year of nurture. Worth wrapping up clearly.
>
> If you're still interested in CDLA.jobs and want to keep hearing from us, hit the button below. We'll send one email per quarter going forward — major platform updates, market trends, occasional Tier 1 calls. Less frequent, same content quality.
>
> [Button: Keep me in the quarterly loop] → confirms continued opt-in, transitions to dormant cadence
>
> If you don't click, we'll assume CDLA.jobs isn't right for your operation right now and shift you to dormant (quarterly only) automatically. You can always come back — sales is reachable any time.
>
> Either way, thanks for staying with the conversation this far.
>
> — The CDLA.jobs team

**Variables:** `first_name`

---

## 5. Sequence B — Tier 2 to Tier 1 upgrade (6 emails)

### 5.1 Cadence

Spread over 6 months, starting 60 days after Tier 2 onboarding completion (the "earned engagement" window — see §3.5).

| Email | Day from Tier 2 onboarding |
|-------|---------------------------|
| Email 1 | Day 60 (Month 2) |
| Email 2 | Day 90 (Month 3) |
| Email 3 | Day 120 (Month 4) |
| Email 4 | Day 150 (Month 5) |
| Email 5 | Day 180 (Month 6) |
| Email 6 | Day 240 (Month 8) |

### 5.2 Email 1 — Day 60 — First Tier 1 introduction

**Subject A:** Quick check on your first 60 days
**Subject B:** [carrier_name] — your 60-day Tier 2 read

**Body:**

> Hi [first_name] —
>
> You've been on Tier 2 for two months. Quick read on what that's looked like:
>
> - **Matched prequalifications delivered:** [matches_delivered_60d]
> - **Drivers who clicked into your carrier card:** [drivers_clicked_into_60d]
> - **Applications started (IntelliApp):** [intelliapps_started_60d]
> - **Applications completed:** [intelliapps_completed_60d]
>
> [Conditional based on data:]
>
> **[If matches_delivered > expected threshold for region/equipment]:** Your match volume is healthy. The question now is timing — at Tier 1, you'd see these prequalifications 24 hours before other carriers. For a carrier matching well at Tier 2, that 24-hour window often translates to first-mover advantage on the best-fit drivers.
>
> **[If matches_delivered <= expected threshold]:** Match volume in your region/equipment is light. Tier 1 doesn't help with volume — it helps with timing. If volume picks up over the next few months as carrier coverage grows, the Tier 1 conversation gets more interesting.
>
> Either way, the 90-day mark is when we'd typically have a working session to review what's working. Want to schedule one?
>
> [Button: Schedule a 90-day review] → calendar booking
>
> — The CDLA.jobs team

**Variables:** `first_name`, `carrier_name`, `matches_delivered_60d`, `drivers_clicked_into_60d`, `intelliapps_started_60d`, `intelliapps_completed_60d`

### 5.3 Email 2 — Day 90 — The exclusivity math

**Subject A:** What 24 hours of exclusivity actually buys you
**Subject B:** Tier 1 first-look — the numbers

**Body:**

> Hi [first_name] —
>
> A pattern in our data: driver-to-carrier engagement is heavily front-loaded in the first 24 hours after a match.
>
> **What we see:**
>
> - **% of click-throughs that happen within 24 hours of match:** ~60-70% (typical; varies by carrier)
> - **% within 48 hours:** ~80%
> - **% after 72 hours:** the remainder, often drivers who got busy and came back
>
> What this means in practice: if a driver matches your carrier and 4 other carriers, the carrier that gets first-look is positioned to convert before competition for that driver's attention starts. Tier 1's 24-hour exclusivity window is built around this pattern.
>
> **Your specific numbers** (last 90 days):
>
> - Carriers also matched to your matched drivers (avg): [avg_competing_carriers]
> - Drivers who clicked into another carrier before you: [drivers_clicked_other_first]
>
> [If drivers_clicked_other_first > 0]:
> That's [drivers_clicked_other_first] driver(s) in 90 days who saw a competing carrier before you. Some of those would have converted to applications regardless; some wouldn't. Tier 1 would have eliminated the comparison.
>
> [Button: Talk through your numbers — schedule a Tier 1 call] → calendar booking
>
> — The CDLA.jobs team

**Variables:** `first_name`, `avg_competing_carriers`, `drivers_clicked_other_first`

### 5.4 Email 3 — Day 120 — Use case: high-competition lanes

**Subject A:** When Tier 1 makes the most sense
**Subject B:** Lanes where 24-hour first-look matters most

**Body:**

> Hi [first_name] —
>
> Not every carrier should be on Tier 1. Honest read on when it makes sense — and when Tier 2 is the right fit.
>
> **Tier 1 makes sense when:**
>
> - You hire in high-competition regions where multiple carriers chase the same driver pool (the Southeast, Texas, the Midwest reefer corridor, anywhere the equipment-region combination is dense)
> - Your recruiting team can act on first-look leads within the 24-hour window
> - You have hiring volume that justifies the $2,500/month against your typical cost-per-hire
> - Your fleet's hiring need is steady, not seasonal-bursty
>
> **Tier 2 is the right fit when:**
>
> - You hire in lower-competition regions where you're often the only matched carrier
> - Your recruiting team works on a slower cycle (week+ to respond to a lead)
> - Your hiring volume is low and the $30K/year subscription doesn't pencil out
> - Your hiring need is bursty (heavy hiring in spring, dormant in winter)
>
> **[If carrier's data suggests Tier 1 fit]:**
> Based on what we're seeing in your region/equipment, you're closer to the Tier 1 fit profile than the Tier 2 fit profile. Worth a conversation.
>
> **[If carrier's data suggests Tier 2 is fine]:**
> Based on what we're seeing, Tier 2 is probably the right fit for now. We'll keep watching and let you know if the picture changes.
>
> [Button: Talk through whether Tier 1 fits] → calendar booking
>
> — The CDLA.jobs team

**Variables:** `first_name`, conditional fit-classification

### 5.5 Email 4 — Day 150 — Time-to-fill argument

**Subject A:** How Tier 1 affects time-to-fill
**Subject B:** Filling seats faster — the Tier 1 calculus

**Body:**

> Hi [first_name] —
>
> Time-to-fill is the metric most carriers under-track for hiring vendor evaluation. It's harder to measure than cost-per-hire but it's the metric that actually moves revenue.
>
> **Industry benchmark for CDL-A time-to-fill:** 30-60 days from posting to butt-in-seat, depending on region, equipment, and how aggressive the carrier is on outreach.
>
> **Where Tier 1 can compress that:**
>
> - **First-look on matched drivers** — driver engagement happens fastest within 24 hours; getting there first compresses the front of the funnel
> - **Priority placement** — when a driver browses their match list, Tier 1 carriers appear first; click-through rate compounds the timing advantage
> - **Quarterly business reviews** — refining your hiring criteria based on what's converting and what isn't shortens cycle time over months
>
> Carriers we've seen move from Tier 2 to Tier 1 typically report time-to-fill compression in the range of 5-12 days, depending on baseline. For a carrier running 5% vacancy at any given time, 5 days off time-to-fill is a real ROI number against $2,500/month.
>
> (The 5-12 day range is from carriers we've worked with; not a guarantee. Your numbers depend on your baseline and your team's speed.)
>
> [Button: Run the time-to-fill math on your operation] → calendar booking
>
> — The CDLA.jobs team

**Variables:** `first_name`

**Compliance note:** the "5-12 days" claim references "carriers we've worked with." If at launch this data doesn't exist (small sample), the language needs to be softened to "what the Tier 1 mechanics are designed to deliver" rather than claiming observed results. Flagged in §7.

### 5.6 Email 5 — Day 180 — Direct ask

**Subject A:** 6 months in — ready for Tier 1?
**Subject B:** Where you stand at 6 months

**Body:**

> Hi [first_name] —
>
> Six months on Tier 2. Direct ask, since we've been respectful of the upgrade conversation up to this point.
>
> **Your data over 6 months:**
>
> - Matched prequalifications delivered: [matches_delivered_6mo]
> - Hires from CDLA.jobs matches: [hires_6mo]
> - Average time from match to hire: [avg_match_to_hire_days] days
>
> **Conditional based on data:**
>
> [If hires > 0 and match volume is strong]:
> The platform is working for you. Tier 1 would compress time-to-fill and give you first-look on the matched drivers we're sending — both materially valuable at your hiring volume.
>
> [If matches strong but hires low]:
> Match volume is healthy but conversion isn't where it could be. Tier 1's quarterly business review process is built around exactly this — diagnosing whether the issue is criteria, pay competitiveness, or response speed.
>
> [If match volume light]:
> Volume is still building. Tier 1 may be premature; let's wait for the next quarter and see how coverage grows.
>
> Either way, the next 30 days would be a useful time to talk about the year ahead.
>
> [Button: Schedule a Tier 1 conversation] → calendar booking
>
> — The CDLA.jobs team

**Variables:** `first_name`, `matches_delivered_6mo`, `hires_6mo`, `avg_match_to_hire_days`

### 5.7 Email 6 — Day 240 — Final upgrade touch

**Subject A:** Last note on Tier 1 — for now
**Subject B:** Wrapping up the upgrade conversation

**Body:**

> Hi [first_name] —
>
> Tier 1 upgrade isn't a fit for every carrier and we don't want to keep asking. This is the last email in the upgrade sequence.
>
> Going forward, you'll receive maintenance content quarterly — match volume reports, platform updates, occasional new feature notes. The Tier 1 conversation reopens if your situation changes (hiring volume picks up, you move into a higher-competition region, your recruiting team grows) or if you ask sales directly.
>
> Tier 2 service continues as-is, unchanged. Matched prequalifications still flow to your Tenstreet account. Nothing about your free tier changes.
>
> If you do want to discuss Tier 1 now, the link below works any time.
>
> [Button: Talk to sales] → calendar booking
>
> — The CDLA.jobs team

**Variables:** `first_name`

---

## 6. Variable resolution and fallbacks

### 6.1 Variables this spec assumes are available

For Sequence A:
- `first_name`, `carrier_name`
- `region` (mapped from carrier's primary hiring region)
- `region_intake_count_90d`, `top_3_equipment`, equipment-mix and home-time percentages
- `pay_median`, `pay_top_25_threshold`, `pay_bottom_25_threshold`, equipment-specific pay variables
- `carrier_equipment` (carrier's primary hiring equipment)

For Sequence B:
- `first_name`, `carrier_name`
- `matches_delivered_60d`, `drivers_clicked_into_60d`, `intelliapps_started_60d`, `intelliapps_completed_60d`
- `matches_delivered_6mo`, `hires_6mo`, `avg_match_to_hire_days`
- `avg_competing_carriers`, `drivers_clicked_other_first`
- Conditional fit classifications (Tier 1 fit vs. Tier 2 fit, based on data thresholds)

### 6.2 Variable resolution failures

Same principle as the driver nurture spec: no fake numbers ever.

- If a data-driven variable can't be resolved, the conditional paragraph that depends on it is suppressed
- If suppression would leave the email empty, the email is skipped that month
- Generic fallback content (industry-survey-style) is acceptable for early-launch emails when carrier-specific data is sparse, but it must be labeled as industry-general, not platform-specific

### 6.3 Early-launch reality

At beta launch, many data variables will return null:
- `region_intake_count_90d` may be too small to publish
- `pay_median` may not have enough data points to be statistically meaningful
- `drivers_clicked_other_first` may not have history yet

The spec is written assuming the data exists. The implementation needs a layered fallback: real data when available, soft general claims when not, skip-and-shift when neither fits.

---

## 7. Open questions

### 7.1 The "5-12 days" time-to-fill claim (Email 4, Sequence B)

§5.5 references a 5-12 day time-to-fill compression range "from carriers we've worked with." At launch this data doesn't exist. Two options:

- **Hold the email** until the data exists (skip Email 4 until cohort data is available)
- **Soften the claim** to "the Tier 1 mechanics are designed to deliver" with no observed range

I'd recommend softening for v1 launch and tightening as real data accumulates. Worth flagging to the attorney for an unfair-claims check regardless.

### 7.2 Cost-of-vacancy math (Email 10, Sequence A)

§4.12 cites industry-general numbers (revenue per truck, driver cost, gross margin). The numbers are reasonable for OTR dry van but vary widely by equipment and lane. Should the email:

- Use the ranges as illustrative (current spec)
- Be tailored per-carrier based on their equipment/region
- Be removed and replaced with a CTA to "run the math together" without numbers

I'd recommend keeping the illustrative ranges with the "your real conversation is your numbers" framing currently in the draft. Tailoring per-carrier requires data we may not have.

### 7.3 Sales team and unsubscribe interaction

If a carrier unsubscribes from nurture but is in active sales conversation, what happens? Two options:

- Sales receives a notification when a prospect/customer unsubscribes, treats it as a signal to slow down outbound
- Unsubscribe applies only to automated nurture; sales 1:1 emails continue regardless

Recommendation: sales receives the notification but continues 1:1 conversations. Unsubscribe stops automation, not human relationships. Sales operations decision.

### 7.4 Asset readiness

Sequence A references "the carrier brief (PDF)" repeatedly. This is the Carrier Pitch Deck Outline v1 exported to PDF. Open: is the PDF version export-ready, or does it need additional design work? If not ready at sequence launch, references need to be replaced or held.

### 7.5 Multi-contact carriers

If a carrier organization has multiple contacts in CDLA.jobs's system (recruiting director, HR, owner), do they all receive the nurture? Or one designated contact?

Recommendation: one designated contact per carrier account, set during sales/onboarding. Multi-contact nurture causes confusion and duplicate replies. Sales operations decision.

### 7.6 Sequence A and B cadence overlap

A carrier who signs up for Tier 2 mid-Sequence A pauses the cold sequence and waits 60 days before entering Sequence B. What if the carrier downgrades or churns during that 60-day window? Recommendation: don't resume Sequence A from where it stopped; treat them as cold again and restart from email 1. But this is an edge case to spec in GHL workflow.

---

## 8. Open questions for the GHL workflow build

### 8.1 Conditional content per email

Many emails have conditional paragraphs (high-match-volume vs. low, fit-classification, etc.). GHL supports conditional content but the conditions need to be specified precisely:

- What thresholds define "high match volume" for a given region/equipment?
- What's the fit-classification logic (Tier 1 vs. Tier 2)?
- How are data-sparse cases handled within the GHL conditional logic vs. handled at the data layer before GHL?

Implementation detail belonging in the GHL Workflow Spec.

### 8.2 Data variable resolution at send time

The data variables (match volume, pay benchmarks, etc.) need to resolve at send time, not at sequence enrollment time. A carrier enrolled in Sequence A on day 1 receives Email 4 on day 28 with day-28 data, not day-1 data. GHL workflow needs to query the analytics layer at each send.

### 8.3 Sequence A → B transition

When a carrier signs up for Tier 2 mid-Sequence A, they exit Sequence A and enter Sequence B with a 60-day delay. The GHL workflow needs to handle the exit and the delayed entry cleanly.

### 8.4 Unsubscribe granularity

Does carrier unsubscribe stop both Sequence A and Sequence B, or just the current sequence? Recommendation: unsubscribe stops all nurture (both sequences and the dormant cadence). Re-subscribe requires explicit re-consent.

---

## 9. Open questions for attorney review

### 9.1 Industry data and benchmark claims

Sequence A Email 5 (pay benchmarks) and Email 7 (objection on lead qualification rate) cite industry-general patterns. Are there UDAP or unfair-claims considerations on using "10-30% of leads qualify" or similar general industry claims in marketing emails? See Attorney Brief Addendum v1 Question 7 (related).

### 9.2 Time-to-fill compression claim

Sequence B Email 4 (§5.5) cites "5-12 day" compression range. If this language is used, attorney review is needed on whether observed-results claims require specific substantiation.

### 9.3 Carrier-name reference in Sequence B emails

Sequence B emails reference the carrier's own name ("[carrier_name] — your 60-day Tier 2 read"). This is standard B2B nurture practice but worth confirming there's no expectation issue if the carrier's name is mis-resolved (e.g., DBA vs. legal name).

---

## 10. What this document does not cover

- The Prospect Carrier Outreach Email (separate spec — used as Sequence A email 1)
- Tier 1 retention nurture (out of scope — separate sequence for active Tier 1 carriers)
- Win-back sequence for churned Tier 2 carriers (out of scope)
- 1:1 sales follow-up (sales operations, not marketing copy)
- Carrier-side transactional emails (when a carrier receives a matched driver prequalification) — separate spec
- Email design / HTML templates — design phase, not copy
- The dormant quarterly cadence content (referenced but not specced; future doc)

---

## 11. Change log

| Date | Change | By |
|------|--------|-----|
| 2026-05-19 | v1 created — Sequence A (12-email cold acquisition) and Sequence B (6-email Tier 2 upgrade) | Todd + Claude |

---

*End of spec.*
