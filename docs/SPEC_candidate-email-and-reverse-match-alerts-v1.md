# Candidate Email + Reverse-Match Alert Templates — CDLA.jobs

**Version:** 1.0
**Status:** Locked
**Audience:** Internal — content, product, engineering, GHL workflow build
**Owner:** Todd Bryson
**Companion documents:** Brand Voice Guide v1, Conversational AI Intake Spec v1, Driver Nurture Sequence Spec v1, Matching Engine Field Schema v2

---

## 1. Purpose

This document specifies two related driver-facing transactional content types:

1. **Candidate email** — the post-intake email a driver receives immediately after completing Stage 1, delivering their matches (or the honest zero-match acknowledgment) as a persistent record.
2. **Reverse-match alert templates** — the email and SMS sent when a *new* carrier joins the platform that matches an existing driver whose match list didn't previously include that carrier.

Both are transactional surfaces, not nurture. They fire on specific events, not on a calendar. Both follow the driver-facing brand voice (warm, direct, sarcasm aimed at competitors not the driver, no emojis).

---

## 2. Candidate email

### 2.1 When it sends

Immediately after Stage 1 consent is captured and the matching engine returns its initial result. The email is the persistent record of what the driver just saw in their chat or form session.

If the matching engine resolves asynchronously (>5 second delay), the candidate email may arrive after the driver has left the page. In either case, the email contains the match list and a link back to `/matches`.

### 2.2 Subject lines (three A/B variants)

**Variant A — Direct:**
> Your CDLA.jobs matches

**Variant B — Data-driven:**
> [match_count] CDL-A carriers matching your profile

If `match_count = 0`, Variant B becomes:
> About your CDLA.jobs intake

**Variant C — Voice-forward:**
> Real talk on your CDL-A matches

**A/B/C test methodology:**
- Distribute traffic evenly across the three variants for the first 200 sends
- Track open rate and click-through rate (CTR on the "see my matches" CTA)
- Pick the winner based on CTR primarily, open rate secondarily
- Once a winner is locked, the other two are retired

### 2.3 Preview text

Single line, supports the subject:

> Here's where you stand, plus what happens next.

(Used across all three subject variants.)

### 2.4 Body — when matches exist (`match_count > 0`)

> Hey [first_name] —
>
> Thanks for finishing your intake. Here's where you stand.
>
> **You matched [match_count] carriers hiring CDL-A drivers in [region].**
>
> [If match_count >= 3, list top 3 carriers by match-fit score, name only, one per line:]
> - [Carrier 1 name]
> - [Carrier 2 name]
> - [Carrier 3 name]
> [If match_count >= 4]: ...and [match_count - 3] more.
>
> [Button: See my matches → /matches]
>
> **What happens next:** when you click into a carrier you're interested in, we'll ask three quick safety questions specific to that carrier (tickets, accidents, criminal history). After that, we send your prequalification to the carrier and you finish their application directly with them. We never send your info anywhere you didn't pick.
>
> If you stopped partway through the chat or form, your matches will still be here when you come back — just log in.
>
> — The CDLA.jobs team

### 2.5 Body — when matches don't exist (`match_count = 0`)

> Hey [first_name] —
>
> Thanks for finishing your intake. Honest update on where you stand.
>
> **We don't have matches for your profile in [region] right now.** Not a rejection — just the current state of which carriers are hiring drivers like you in your area. The matching engine looks every day, and the second something fits we'll email you.
>
> Two things that might help:
>
> 1. **Update your preferences.** If you're open to more regions, different equipment, or you have endorsements you didn't list, that opens up the match pool. [Button: Update my preferences → /intake/edit]
>
> 2. **Wait.** New carriers join the platform constantly. Drivers in your exact situation often see matches appear within a few weeks as we expand coverage.
>
> No matches today doesn't mean no matches ever. We'll keep watching.
>
> — The CDLA.jobs team

### 2.6 Body — when intake is incomplete (Stage 1 abandoned)

This case is included because some drivers will start intake and leave before Stage 1 consent is captured. They reached Debbie or the form, gave some answers, then left without submitting. We don't have consent to email them. **This case is explicitly out of scope for the candidate email** — no candidate email is sent without Stage 1 consent.

If we want to recover abandoned intakes, that's a separate "abandoned cart" sequence that requires its own consent posture, which we don't currently have. Add to attorney brief queue if pursuing.

### 2.7 Variables required

| Variable | Source |
|----------|--------|
| `first_name` | Driver intake (Stage 1) |
| `match_count` | Matching engine result |
| `region` | Driver `cdl_state` mapped to human-readable region |
| Top 3 carrier names | Match list, ranked by match-fit score |

### 2.8 Send time

Immediate. No delay, no batching, no "best time of day" optimization. The candidate email is a transactional confirmation of the action the driver just took; delayed delivery breaks the mental model.

### 2.9 Variable resolution failures

- If `match_count` can't be resolved (matching engine errored), the email is **not sent**. The driver sees their matches in the session and we don't generate a stale email with bad data. Engineering monitoring picks up the matching engine error.
- If `first_name` is missing, the greeting falls back to "Hey there —" (no awkward "Hey [first_name]" or "Hey driver"). First_name should never be missing in practice because it's a required Stage 1 field.
- If `region` can't be mapped from `cdl_state` (unusual state code, territory, etc.), the email substitutes "your area" for the region-specific phrasing.

### 2.10 What the candidate email is *not*

It is not:
- A welcome email ("Welcome to the CDLA.jobs family!")
- A nurture email (those have their own cadence and content per the Driver Nurture Sequence Spec)
- A platform tour ("Here's how to use CDLA.jobs!")
- A pitch for an upsell, premium tier, or anything else

It is one job — confirm intake, deliver matches, set expectations for what's next. That's it.

---

## 3. Reverse-match alert templates

### 3.1 What triggers a reverse-match alert

A reverse-match alert fires when **a new carrier joins the platform (or an existing carrier expands their criteria) and matches a driver who is in `active` state or `paused_user_request` state** *and* whose existing match list did not previously include this carrier.

The alert does NOT fire when:
- The driver is in `paused_post_hire` (post-hire pause; no nurture or alerts)
- The driver is in `unsubscribed_all`
- The driver already had this carrier in their match list before (it's not a new match)

### 3.2 Carrier name disclosure

**Carrier name is withheld in subject and preview.** The driver must click through to see which carrier matched.

Reasons for this design:
- Improves click-through rate (curiosity gap)
- Prevents drivers from making snap decisions based on brand prejudice without seeing the actual fit data
- Avoids tipping off competitors who scrape inboxes that a specific carrier is hiring in a specific region

The carrier name **is** revealed on the click-through destination page (`/matches/new`). The withholding is at the alert-delivery layer only, not at the platform layer.

### 3.3 Frequency cap and aggregation

**Hybrid model:**

- **Within a 24-hour window:** all new matches for a driver collapse into a single alert. If three carriers match a driver within 24 hours, they receive one alert mentioning "3 new carriers" rather than three separate alerts.
- **Weekly cap:** maximum 3 reverse-match alert send-events per driver per rolling 7-day window. The fourth+ event in a week is queued and folded into the next eligible send.
- **24-hour aggregation window resets** when an alert sends. After an alert goes out, the next aggregation window begins.

The cap exists to prevent alert fatigue. A driver who's a strong fit in a high-growth region could match 5+ carriers per week; sending 5 emails is alert fatigue that triggers unsubscribes. Capping at 3 per week is a defensible balance.

### 3.4 Channel rules

**Email:** sent for every reverse-match alert event (subject to the 24-hour aggregation and weekly cap).

**SMS:** sent only when the alert involves a **high-fit match** — specifically, either:
- A Tier 1 subscription carrier matching the driver, OR
- A match-fit score in the top quartile of the driver's historical match scores

Reasons:
- SMS is rate-limited to 2 per month per driver (Driver Nurture Sequence Spec §7.4)
- Reverse-match SMS competes for that budget with match-event SMS from the nurture sequence
- High-fit-only SMS preserves the SMS channel for genuinely useful alerts; lower-fit alerts use email only

### 3.5 Email template — single new match

**Subject:**
> New CDL-A carrier matching your profile in [region]

**Preview text:**
> One new match this week. Worth a look.

**Body:**

> Hey [first_name] —
>
> A carrier just joined CDLA.jobs that matches your profile. They're hiring CDL-A drivers in [region] for [equipment_preference]. [If pay data available: "Pay range $[pay_low]–$[pay_high] weekly."]
>
> [Button: See the match → /matches/new]
>
> If you're not actively looking right now, ignore this. We'll keep watching.
>
> — The CDLA.jobs team

**Variables:**
- `first_name`
- `region` (driver's region)
- `equipment_preference` (driver's primary desired equipment)
- `pay_low`, `pay_high` (carrier's weekly pay range, if disclosed)

### 3.6 Email template — multiple new matches (24-hour aggregation)

**Subject:**
> [new_match_count] new CDL-A carriers matching you in [region]

**Preview text:**
> Worth a look — and what to do if these aren't your fit.

**Body:**

> Hey [first_name] —
>
> [new_match_count] new carriers joined CDLA.jobs that match your profile. All hiring CDL-A drivers in [region] for the equipment you're looking for.
>
> [Button: See the matches → /matches/new]
>
> [If new_match_count >= 4]: That's a noticeable jump — sometimes happens when a new region opens up or a recruiter network turns on. Worth scanning.
>
> If none of them are your fit, no problem. Your existing matches are still there, and we'll keep watching for more.
>
> — The CDLA.jobs team

**Variables:** `first_name`, `new_match_count`, `region`

### 3.7 Email template — Tier 1 match (high-fit, also triggers SMS)

When the new match is a Tier 1 carrier (within their 24-hour exclusivity window), the email has slightly different copy that reflects the time-sensitivity without overselling it.

**Subject:**
> New CDL-A carrier in [region] — worth a fast look

**Preview text:**
> One match this week, and they're paying for first-look access.

**Body:**

> Hey [first_name] —
>
> A new carrier just joined CDLA.jobs that matches your profile in [region]. They're a Tier 1 subscriber — meaning they pay for 24-hour first-look access to matched drivers like you.
>
> What that means for you: they see your prequalification before other carriers do, if you choose to release it. After 24 hours, the listing's available to other carriers too. No pressure to move fast — but if you were going to look anyway, today's a good day.
>
> [Button: See the match → /matches/new]
>
> If they're not your fit, just ignore this. They'll still be in your match list after the exclusivity window expires.
>
> — The CDLA.jobs team

**Variables:** `first_name`, `region`

**Compliance note:** The phrase "they pay for 24-hour first-look access" is disclosure of the exclusivity window. The Carrier Landing Page Copy Spec §4.7 (FAQ on Tier 1) stated "drivers are never told they were in an exclusivity window" — this email contradicts that. The Tier 1 alert specifically chooses to disclose because:
- The driver is being told about a time-sensitive opportunity
- Honest disclosure of why they're being told now is better than implying urgency without explaining it
- The attorney brief addendum Question 7 (paid placement disclosure) likely requires this disclosure anyway

This is a real product decision worth flagging — see §6.2 open question.

### 3.8 SMS template — high-fit match

Per §3.4, SMS fires only for Tier 1 or top-quartile match-fit matches.

> CDLA.jobs: New CDL-A carrier matching your profile in [region]. See match: [short_link]
> Reply STOP to opt out.

For Tier 1 specifically:

> CDLA.jobs: New CDL-A carrier in [region] paying for first-look on matches like you. 24hr window. See: [short_link]
> Reply STOP to opt out.

**Variables:** `region`, `short_link`

**Length:** Both SMS variants are under 160 characters including the STOP reminder, so they send as single-segment SMS rather than concatenated multi-part messages. Single-segment SMS has materially better deliverability and lower cost.

### 3.9 Send time

Per Driver Nurture Sequence Spec §11.2: SMS sends only 8am-7pm driver local time, weekdays only unless time-sensitive.

For reverse-match alerts:
- **Tier 1 alerts** are treated as time-sensitive (the 24-hour exclusivity window is ticking), so SMS sends within local-time daylight hours regardless of weekday/weekend
- **Standard reverse-match alerts** follow the weekday-only rule

Email follows the standard nurture timing — 10am driver local time for the daily aggregation send.

### 3.10 The destination page (`/matches/new`)

The click-through destination shows:
- The carrier name and basic info (location, equipment hiring for, pay if disclosed)
- The driver's match-fit explanation (why we matched this driver to this carrier)
- Two CTAs:
  - **Primary:** "Continue to qualifying questions" → kicks off Stage 2 flow for this carrier
  - **Secondary:** "Show me my full match list" → `/matches`

`/matches/new` is the same UX as a single carrier card in the full match list, but as a dedicated page reachable from the alert. The page itself is outside the scope of this content spec — covered in Core Technical Spec v5 (when drafted).

---

## 4. Voice and tone notes

### 4.1 Candidate email voice

The candidate email is more **transactional and direct** than nurture. The driver just completed an intake; they're at the peak of their attention to CDLA.jobs. The email confirms what they did and tells them what's next. No padding, no nurture-style "we're so glad you joined us" emotion.

### 4.2 Reverse-match alert voice

Reverse-match alerts are **brief and signal-driven**. The driver opted in to be told when something new fits; the alert tells them. The email body is 2-4 short paragraphs max.

Both formats avoid:
- "Exciting news!" or any exclamation-pointed opening
- "Just for you" personalization that's actually templated and the driver knows it
- Fake urgency ("limited time!" "act fast!") on standard reverse-match alerts (Tier 1 is different)
- Recap of what the driver told us at intake (they remember)

### 4.3 The carrier-named alerts

When carrier names appear (in the Tier 1 alert post-click, in the candidate email's top-3 list), they're presented **without endorsement** — no "great carrier!" or "highly rated." Just the name. CDLA.jobs is the matching service; the driver and the carrier figure out the rest.

---

## 5. Variable resolution fallbacks

For both content types:

| Variable | If unresolvable | Fallback |
|----------|-----------------|----------|
| `first_name` | Use "Hey there —" instead of "Hey [first_name] —" |
| `region` | Use "your area" instead of "[region]" |
| `equipment_preference` | Omit the equipment-specific clause; refer generically to "matching your profile" |
| `pay_low`, `pay_high` | Omit the pay clause entirely; don't substitute fake or industry-average numbers |
| `match_count` | If matching engine errored: don't send the email; alert engineering |
| Top 3 carrier names | If fewer than 3 matched: list as many as exist; don't pad |

No variable resolves to a fake number, a placeholder, or a generic substitute that implies precision. Per Brand Voice Guide: if we can't say it accurately, we don't say it.

---

## 6. Open questions

### 6.1 Candidate email A/B test duration

200 sends per variant before declaring a winner is the spec default. For a beta-stage platform with low initial volume, 200 sends per variant may take weeks. Two options:
- Lower the threshold to 100/variant for faster decisions, accepting lower statistical confidence
- Hold the 200 threshold, run the test longer

I'd recommend holding the 200 threshold — winning the wrong variant early is worse than waiting for clear signal. But low launch volume may force the issue.

### 6.2 Tier 1 alert disclosure of exclusivity window

§3.7 includes language explicitly disclosing the Tier 1 exclusivity window to the driver ("they pay for 24-hour first-look access"). This contradicts the carrier landing page's assertion that drivers aren't told. There are two consistent positions and we need to pick one:

- **Disclose to drivers in the alert** (as currently drafted). The carrier landing page language is revised to say "drivers aren't told *unless* the carrier matches them after they're already in the system, in which case they may receive a time-sensitive alert."
- **Don't disclose to drivers in the alert.** The Tier 1 alert reads more like a generic alert with a time-sensitive framing that doesn't explain the underlying mechanism.

Disclosure is the more honest and probably the legally safer answer (see Attorney Brief Addendum v1 Question 7 on paid placement disclosure). **Recommendation: disclose, revise the carrier landing page accordingly.** Attorney's call.

### 6.3 SMS frequency cap interaction

The Driver Nurture Sequence Spec §7.4 caps SMS at 2 per month per driver. Reverse-match alert SMS competes for that budget. If a driver hits their cap from nurture activity in a month, reverse-match SMS won't send. Acceptable? Or should reverse-match SMS be exempt from the nurture cap and have its own (e.g., 1 per week) cap?

I'd recommend **keep them under the same cap** for simplicity and to prevent total SMS volume from exceeding the driver's tolerance. If a driver is high-volume on matches, they'll see the alerts via email and the SMS layer becomes a tie-breaker for the most important ones.

### 6.4 The `/matches/new` page UX

This spec references `/matches/new` as the click-through destination but doesn't fully spec the page. Open: is `/matches/new` a separate route showing only the alert-triggering match, or is it `/matches` filtered to "new since last visit"?

Recommendation: separate dedicated route showing only the alert-triggering match(es), with a "see all matches" CTA. Cleaner UX for an alert click. Spec in Core Technical Spec v5.

---

## 7. Open questions for the GHL workflow build

### 7.1 24-hour aggregation logic

The hybrid frequency cap requires GHL to hold reverse-match events for up to 24 hours before sending, aggregating multiple events into one send. This is non-trivial GHL workflow logic. May require a custom event queue rather than pure GHL workflow triggers.

### 7.2 Weekly send cap enforcement

The 3-per-week cap requires GHL to track per-driver send counts over a rolling 7-day window. GHL supports this natively but the workflow needs to be configured for the rolling window, not a fixed weekly reset.

### 7.3 Tier 1 detection in alert logic

The alert template differentiates Tier 1 matches from standard matches. The alert system needs to query the carrier's tier at send time and route to the correct template. Spec in GHL Workflow Spec.

### 7.4 Match-fit score quartiles per driver

The SMS-for-top-quartile rule requires computing each driver's historical match-fit score distribution. For new drivers without history, fallback rule needed: either treat all early matches as eligible for SMS, or use platform-wide quartile thresholds until per-driver history accumulates.

Recommendation: platform-wide quartile thresholds until the driver has 10+ historical matches, then switch to per-driver.

---

## 8. Open questions for attorney review

### 8.1 Tier 1 paid placement disclosure language

The Tier 1 alert email (§3.7) discloses the exclusivity window. Is the language sufficient under FTC and state UDAP? Specifically: is "they pay for 24-hour first-look access" adequate, or does the disclosure need to be more explicit (e.g., "this carrier is a paid subscriber to CDLA.jobs")? See Attorney Brief Addendum v1 Question 7.

### 8.2 Carrier name withholding and TCPA / state law

The reverse-match alert subject withholds the carrier name. Email subject lines withholding key information are sometimes flagged as deceptive under FTC guidance. Is the curiosity-gap design defensible, or does the subject need to disclose more?

### 8.3 Pay disclosure in alerts

The single-match email (§3.5) includes "Pay range $[pay_low]–$[pay_high] weekly" when disclosed by the carrier. If the carrier later changes the pay range or the actual offer differs, is CDLA.jobs exposed for misrepresentation? Or is "as disclosed by the carrier at the time of match" sufficient defense?

---

## 9. What this document does not cover

- The 3-day IntelliApp completion follow-up sequence — separate spec (GHL Workflow)
- The platform-internal `/matches`, `/matches/new`, `/matches/[id]/qualify` page UX — Core Technical Spec v5
- Carrier-side email templates (when a carrier receives a matched driver's prequalification) — separate spec
- Prospect carrier outreach email — separate spec
- Driver nurture sequence — separate spec (already exists)
- Email design / HTML templates — design phase, not copy

---

## 10. Change log

| Date | Change | By |
|------|--------|-----|
| 2026-05-19 | v1 created (combined Candidate Email + Reverse-Match Alert spec) | Todd + Claude |

---

*End of spec.*
