# Driver Nurture Sequence Spec — CDLA.jobs

**Version:** 1.0
**Status:** Locked (pending attorney review of TCPA frequency disclosure and post-hire email content)
**Audience:** Internal — content, product, engineering, GHL workflow build
**Owner:** Todd Bryson
**Companion documents:** Brand Voice Guide v1, Conversational AI Intake Spec v1, Matching Engine Field Schema v2

---

## 1. Purpose

This document specifies the **driver nurture email and SMS sequence** for CDLA.jobs — the ongoing communication a driver receives after completing intake. It covers:

- The nurture state machine (active, paused post-hire, unsubscribed)
- The active-phase email sequence (6 distinct monthly emails for the first 6 months)
- The maintenance cadence for drivers active past month 6
- The post-hire pause behavior (2 emails during pause, then automatic resume)
- The resume-from-pause sequence
- SMS counterparts where applicable
- Unsubscribe handling

Email and SMS content for the **transactional surfaces** (intake confirmation, match alerts, IntelliApp completion follow-up) are covered in separate specs. This document covers the **ongoing relationship surface** — the emails that keep CDLA.jobs in a driver's life between matches.

---

## 2. Strategic context

Driver nurture exists for two reasons:

1. **Drivers don't switch jobs on demand.** A driver who completes intake today may not be ready to make a move for 60 days, 6 months, or 2 years. Nurture keeps CDLA.jobs in their mind so when they're ready, they come back.
2. **Match pools change.** A driver in a sparse region or with a tough background today may be unmatched at intake but become matchable next month as new carriers join or expand criteria. Nurture surfaces those new matches.

The driver-facing voice rule applies throughout (Brand Voice Guide v1): warm, driver-first, direct, no corporate buzzwords, no emojis, no fake urgency, sarcastic toward Indeed is fine and welcome.

Nurture is **email-primary** with optional SMS counterparts. SMS only goes to drivers who opted in at Stage 1 (`sms_opt_in = true`). Email reaches all drivers in the nurture pool regardless.

---

## 3. Nurture state machine

### 3.1 States

A driver is in exactly one of four nurture states at any time:

| State | Description |
|-------|-------------|
| `active` | Driver is in the matching pool. Receives monthly nurture emails per the active-phase sequence. |
| `paused_post_hire` | Driver got hired through CDLA.jobs. Receives 2 emails during the pause window (at hire, at month 3). Receives no other nurture content. |
| `paused_user_request` | Driver explicitly asked to pause (without unsubscribing). Receives no nurture content. (Granular pause options are a v2 feature; in v1 this state exists in the schema but isn't user-triggerable. Reserved.) |
| `unsubscribed_all` | Driver clicked unsubscribe or replied STOP. Receives no nurture content of any kind, ever, unless they re-consent. |

### 3.2 State transitions

| From | To | Trigger |
|------|-----|---------|
| (new driver) | `active` | Stage 1 consent captured |
| `active` | `paused_post_hire` | Hire confirmed via Tenstreet status webhook (or other hire signal) |
| `paused_post_hire` | `active` | Automatic at month 7 (6 months after `paused_post_hire` state entered) |
| `active` or `paused_post_hire` | `unsubscribed_all` | Driver clicks unsubscribe in email, or replies STOP to SMS |
| `unsubscribed_all` | `active` | Only via explicit driver re-consent (e.g., driver re-completes intake or affirmatively opts back in) |

### 3.3 Multi-channel state

Within `active`:
- Email is always sent
- SMS is sent only if `sms_opt_in = true` on the driver record

Reply STOP to any SMS triggers `unsubscribed_all` for the entire nurture system, not just SMS. The reply-STOP-only-stops-SMS pattern is allowed under TCPA but operationally messy; we treat STOP as a full unsubscribe to keep state simple.

Click unsubscribe in email triggers `unsubscribed_all` for the entire nurture system.

**Open question:** does the attorney want driver-initiated channel-specific opt-out (stop SMS but keep email, stop email but keep SMS), or is the all-or-nothing simplicity acceptable? See §13.

---

## 4. Active-phase email sequence

Six distinct emails delivered monthly during the first 6 months of `active` state. After month 6, the maintenance cadence (§5) takes over.

### 4.1 Send schedule

| Email | When |
|-------|------|
| Email 1 | Month 1 (30 days after intake) |
| Email 2 | Month 2 (60 days after intake) |
| Email 3 | Month 3 (90 days after intake) — educational |
| Email 4 | Month 4 (120 days after intake) |
| Email 5 | Month 5 (150 days after intake) |
| Email 6 | Month 6 (180 days after intake) — educational + re-engagement |

Sends occur on the **same day-of-week as the driver's intake date**, around 10am local time (driver's CDL state timezone). Drivers who intake on a Saturday get nurture on subsequent Saturdays.

**Why same day-of-week:** drivers have predictable weekly rhythms. A driver who completed intake on a weekday is more likely to check email on weekdays going forward. Matching the original-intake day produces marginally better open rates than blasting everyone on Mondays.

### 4.2 Email 1 — Month 1 (Match update)

**Subject line A:** New CDL-A carriers in [region] this month
**Subject line B:** What's new in [region] for CDL-A drivers

(A/B test the two; pick the winner after 200 sends.)

**Preview text:** A look at what's matching, what's new, and what to do if nothing fits yet.

**Body:**

> Hey [first name] —
>
> It's been about a month since you finished your intake. Here's where things stand.
>
> **What's matching for you right now:** [match_count] carriers in [region] are still hiring drivers like you. [If match_count > 0, link to /matches.] [If match_count = 0, see fallback below.]
>
> **What's new in [region] this month:** We've added [new_carriers_count] new carriers to the platform since you signed up — [list 2-3 by name if any matched the driver, otherwise omit].
>
> If your situation has changed (new equipment, new pay floor, you're more open to relocation), update your preferences and we'll re-match you. Takes about a minute.
>
> [Button: Update my preferences → /intake/edit]
>
> If you're already in conversation with a carrier we matched you with, ignore this. Just checking in.
>
> — The CDLA.jobs team

**Fallback for `match_count = 0`:**

> Hey [first name] —
>
> It's been about a month since you finished your intake. Honest update: we don't have new matches for you in [region] right now. New carriers are joining the platform constantly, and equipment / region coverage grows weekly. We're watching and we'll email you the moment something fits.
>
> If anything has changed on your end — new endorsements, more flexibility on region or equipment, different pay floor — update your preferences and we'll re-run the match.
>
> [Button: Update my preferences → /intake/edit]
>
> — The CDLA.jobs team

**Variables:**
- `first_name` — driver's first name
- `region` — driver's `cdl_state` mapped to a human-readable region name (e.g., "GA" → "Georgia")
- `match_count` — number of currently-matching carriers
- `new_carriers_count` — carriers added since driver's intake date

### 4.3 Email 2 — Month 2 (Re-engagement)

**Subject line A:** Anything change since we last talked?
**Subject line B:** Your CDLA.jobs profile, 60 days in

**Preview text:** A quick check-in — and an honest read on what's matching.

**Body:**

> Hey [first name] —
>
> 60 days in. Two questions:
>
> **1. Has anything changed?** Driver life moves fast. New equipment certification, new endorsement, you got tired of OTR and want something local, you're open to a different region — any of these changes how we match you. Takes a minute to update.
>
> [Button: Update my preferences → /intake/edit]
>
> **2. Are you actually looking right now?** Sometimes drivers intake when they're curious, not ready. If you're not actively looking, no problem — we'll keep watching for you in the background. If you want us to stop emailing until you're ready, hit the unsubscribe link below and come back when the time's right.
>
> [If match_count > 0]: Either way, here's what's matching right now: [match_count] carriers in [region]. [Button: See my matches → /matches]
>
> — The CDLA.jobs team

**Variables:** `first_name`, `match_count`, `region`

### 4.4 Email 3 — Month 3 (Educational)

**Subject line A:** What CDL-A pay actually looks like in [region] right now
**Subject line B:** [region] CDL-A pay benchmarks, real numbers

**Preview text:** Real pay data from carriers we work with. Not industry surveys — actual matched-driver pay.

**Body:**

> Hey [first name] —
>
> Quarterly pay benchmark for [equipment-preference] drivers in [region]:
>
> - **Median weekly pay:** $[pay_median]
> - **Top quartile:** $[pay_top_25_threshold]+
> - **Bottom quartile:** $[pay_bottom_25_threshold] or less
>
> [If driver's `min_weekly_pay` floor is between top and median]: Your floor of $[driver_min_pay] puts you in the upper half of what carriers in [region] are paying for [equipment-preference]. That's competitive.
>
> [If driver's floor is above the top quartile]: Your floor of $[driver_min_pay] is above the top quartile of what carriers in [region] are paying for [equipment-preference]. That's why your match count may be lower than other drivers' — most carriers in your region pay below your floor. Either you wait for higher-paying carriers (some are coming), or you adjust the floor.
>
> [If driver's floor is below median]: Your floor of $[driver_min_pay] is below median for [equipment-preference] in [region]. You're not leaving money on the table by having a low floor — the matching engine doesn't cap you — but you should know carriers in your region typically pay more than your floor.
>
> [Button: Update my preferences → /intake/edit]
>
> Numbers come from the carriers actively hiring through CDLA.jobs right now. They update as the market moves.
>
> — The CDLA.jobs team

**Variables:** `first_name`, `region`, `equipment_preference` (driver's primary desired equipment), `pay_median`, `pay_top_25_threshold`, `pay_bottom_25_threshold`, `driver_min_pay`

**Note:** If the pay variables can't be resolved (no carrier data in driver's region/equipment), substitute a fallback email about industry pay trends generally. See Section 4.10 for fallback handling.

### 4.5 Email 4 — Month 4 (Match update)

**Subject line A:** [new_carriers_count] new carriers since you started
**Subject line B:** A few months in — here's what's changed

**Preview text:** New carriers, new matches, and a question.

**Body:**

> Hey [first name] —
>
> Four months in. Quick update on what's new since you intaked:
>
> **New carriers added to the platform:** [new_carriers_count]
> **Of those, matching your preferences:** [new_carriers_matching_count]
> **Total carriers currently matching you:** [match_count]
>
> [If new_carriers_matching_count > 0]: Worth a look. [Button: See my matches → /matches]
>
> [If new_carriers_matching_count = 0 but match_count > 0]: No new matches this month, but you've still got [match_count] from earlier. [Button: See my matches → /matches]
>
> [If match_count = 0]: We don't have anything matching your preferences right now. The matching engine looks every day. The honest read: drivers in your specific situation often see matches show up as we expand carrier coverage. Could be next week, could be next quarter.
>
> One question if you have a sec: anything specific you wish CDLA.jobs did differently? Reply to this email — it's a real inbox, not a no-reply.
>
> — The CDLA.jobs team

**Variables:** `first_name`, `new_carriers_count` (added since driver's intake), `new_carriers_matching_count` (subset matching the driver), `match_count`

### 4.6 Email 5 — Month 5 (Re-engagement)

**Subject line A:** Five months in — quick check
**Subject line B:** Are we still useful, or should we step back?

**Preview text:** Honest question. If we're not, we'd rather know.

**Body:**

> Hey [first name] —
>
> Five months since intake. Honest question: is CDLA.jobs still useful to you?
>
> If you're still looking and we're not delivering matches that fit, that's on us — and we'd want to know. Reply to this email and tell us what's not working. We read every reply.
>
> If you're still looking and we are delivering matches but nothing's converted to a hire, the matching is working but the interviews aren't landing. That's usually a fit issue with the specific carriers, not a profile issue with you. Sometimes worth updating your preferences to widen the pool a bit.
>
> [Button: Update my preferences → /intake/edit]
>
> If you're not looking anymore — you found something off-platform, you decided to stay where you are, you're taking a break from driving — let us know. We'll pause the emails and you can come back whenever.
>
> [Button: Pause for now → /pause]
>
> Or just hit unsubscribe below. No hard feelings.
>
> — The CDLA.jobs team

**Variables:** `first_name`

**Note:** The "Pause for now" button links to `/pause`, a v2 feature. In v1, the button is not surfaced (paragraph removed), and only unsubscribe is offered. See Section 13.2.

### 4.7 Email 6 — Month 6 (Educational + re-engagement)

**Subject line A:** Six months in — what we've learned about your search
**Subject line B:** Half a year on CDLA.jobs

**Preview text:** Stats from your six months on the platform, plus an honest assessment.

**Body:**

> Hey [first name] —
>
> Six months on CDLA.jobs. Quick stats from your time so far:
>
> - **Matches you've seen:** [total_matches_shown]
> - **Carriers you've clicked into:** [carriers_clicked_count]
> - **Applications you started:** [intelliapps_started_count]
> - **Applications you completed:** [intelliapps_completed_count]
>
> [Branching based on engagement:]
>
> **[If carriers_clicked_count = 0]:** You've seen [total_matches_shown] matches but haven't clicked into any of them. That tells us either the matches aren't fitting what you really want (preferences need updating) or you're not actively looking right now. Both are fine — let us know which one and we'll adjust.
>
> **[If intelliapps_started_count > 0 but intelliapps_completed_count = 0]:** You've started applications but haven't finished any. Carriers usually take a couple of weeks to respond after a completed app — if you've been waiting for a response without applying, you're waiting on something that hasn't been triggered yet. Worth completing the app on the carrier you were most interested in.
>
> **[If intelliapps_completed_count > 0 but no hire]:** You've completed [intelliapps_completed_count] applications. Carrier hiring takes 30-60 days from completed app in most cases, sometimes longer. If you completed an app more than 60 days ago and haven't heard, it's reasonable to follow up with that carrier directly.
>
> [Button: Update my preferences → /intake/edit]
>
> From here, we'll dial back the email cadence to keep you in the loop without flooding your inbox. We'll send updates when something specific changes — new carrier in your region, big shift in pay benchmarks, or anything else worth your attention.
>
> Or unsubscribe if you'd rather we stop. No problem.
>
> — The CDLA.jobs team

**Variables:** `first_name`, `total_matches_shown`, `carriers_clicked_count`, `intelliapps_started_count`, `intelliapps_completed_count`

---

## 5. Maintenance cadence (month 7+)

After Email 6, drivers still in `active` state shift to a less frequent cadence. The goal: stay present without being annoying for drivers who haven't converted in the first 6 months.

### 5.1 Frequency

- **Monthly "match-event" emails:** sent only when something material happens (new carrier matching, new equipment expansion, the driver's match list grows by 2+ carriers, etc.). Not on a fixed schedule — driven by signals.
- **Quarterly educational emails:** pay benchmarks, equipment trends, or seasonal hiring patterns. Sent on the first of January, April, July, October regardless of driver-specific signals.
- **Re-engagement email at month 12:** "It's been a year — still looking?" One-off touch.
- **Re-engagement email at month 18:** Similar to month 12. If the driver hasn't engaged in 18 months, this is the last attempt before moving to a "dormant" sub-state of `active` where they receive only quarterly educational emails.

### 5.2 Maintenance email — match-event template

Sent when a new carrier matches the driver, or the match list grows by 2+ carriers.

**Subject:** [match-event-summary in 6-8 words]

Examples:
- "3 new reefer carriers in Georgia"
- "New Hazmat carrier matching your profile"
- "Your match list just grew by 4"

**Body:**

> Hey [first name] —
>
> [summary of the event — what changed, in 1-2 sentences.]
>
> [Button: See my matches → /matches]
>
> — The CDLA.jobs team

Short, transactional, no padding. The driver opens, sees the news, clicks if interested.

### 5.3 Maintenance email — quarterly educational template

Sent first Monday of January / April / July / October to all `active` drivers regardless of engagement. Content rotates:

- **Q1 (Jan):** Annual pay benchmark for the driver's region/equipment
- **Q2 (Apr):** Spring/summer freight market trends
- **Q3 (Jul):** Mid-year market check, equipment shifts
- **Q4 (Oct):** End-of-year hiring patterns, what's typical in Q4-Q1 for CDL-A hiring

Format follows the Email 3 (Month 3) template — data-driven, region-specific, with the driver's preferences as context.

### 5.4 Year-1 re-engagement (month 12)

**Subject:** A year in — still looking?

**Body:**

> Hey [first name] —
>
> A year ago you finished your intake on CDLA.jobs. Worth a check-in.
>
> If you're still looking, three things might help:
>
> 1. **Update your preferences.** A lot can change in a year — equipment, endorsements, what you're willing to consider. Refreshing your profile re-runs the match against the current carrier pool. [Button: Update my preferences → /intake/edit]
>
> 2. **Look at your match list.** [If match_count > 0]: You currently have [match_count] matches. [Button: See my matches → /matches]
>
> 3. **Reply to this email** if there's something specific blocking you. We read every reply.
>
> If you're not looking anymore, hit unsubscribe and we'll wrap up. Good luck out there either way.
>
> — The CDLA.jobs team

### 5.5 Month-18 re-engagement

Similar to month-12 but shorter. After this, if the driver hasn't engaged, they shift to **dormant** (quarterly educational emails only, no monthly cadence).

---

## 6. Post-hire pause sequence

When a hire is confirmed (driver hired by a carrier matched through CDLA.jobs), the driver moves from `active` to `paused_post_hire`. During the 6-month pause, the driver receives **two emails only**.

### 6.1 Hire confirmation email (month 0 of pause)

Sent immediately when hire is confirmed.

**Subject:** Congrats on the new gig — quick note

**Body:**

> Hey [first name] —
>
> [Carrier name] confirmed you started with them. Congrats.
>
> Here's what to expect from us going forward: we're going to step back. No matches, no nurture emails, no re-engagement texts — for the next 6 months. You just made a move; you don't need us in your inbox.
>
> We'll check in at 90 days to see how it's going. Then we'll be back to a regular cadence after 6 months in case you want to keep an eye on the market.
>
> If anything goes sideways before then and you need to start looking again, you can always log in and re-run matches. Your profile is still here.
>
> [Button: My account → /account]
>
> Good luck out there.
>
> — The CDLA.jobs team

**Variables:** `first_name`, `carrier_name` (the carrier the driver was hired by)

### 6.2 Month-3 pause check-in email

Sent 90 days after the hire confirmation date.

**Subject:** 90 days at [carrier name] — how's it going?

**Body:**

> Hey [first name] —
>
> You're 90 days into the new gig at [carrier name]. Honest question:
>
> **How's it actually going?**
>
> Three things this email is and isn't:
>
> - **Not a recruiting pitch.** We're not trying to move you. You just got there.
> - **Not a survey.** We don't want a 1-10 rating.
> - **A real check-in.** Reply to this email if anything's off — pay's not what was promised, dispatch is rough, the home time isn't real. We track this kind of thing because it affects how we rank carriers going forward. Your honest read helps the next driver.
>
> If things are going well, ignore this. We'll be back in 3 months when the 6-month pause ends, in case you want to start watching the market again at that point.
>
> — The CDLA.jobs team

**Variables:** `first_name`, `carrier_name`

### 6.3 Automatic resume to active state

At month 7 (6 months after hire confirmation date), the driver automatically transitions from `paused_post_hire` back to `active`. They begin receiving the maintenance cadence (§5) — *not* the Month 1-6 active-phase sequence, since that already ran during their original active phase.

**Risk flagged in design phase:** auto-resume may feel like CDLA.jobs is recruiting drivers away from carriers we placed them at. This is accepted as the v1 behavior. Mitigation if needed: the maintenance cadence's match-event emails only fire on material new matches, so a driver who's still happy at their placement carrier may not actually receive content until something interesting shows up. Quarterly educational emails will fire regardless.

---

## 7. SMS counterparts

SMS is opt-in only (`sms_opt_in = true` on the driver record). The SMS layer is **lighter** than the email layer — not every email has an SMS counterpart.

### 7.1 SMS goes out for

- **Match-event notifications** (new carrier matching, match list grew significantly) — but only when material
- **IntelliApp completion follow-up** (covered in separate spec; not nurture)
- **STOP / HELP confirmations** (TCPA compliance)

### 7.2 SMS does not go out for

- Educational emails (pay benchmarks, market trends — too long for SMS, low value)
- Monthly check-ins (re-engagement happens on email)
- Post-hire emails (hire confirmation and 90-day check-in are email-only)
- Maintenance cadence quarterly educational emails

### 7.3 SMS templates

**Match-event SMS (new carrier matching):**

> CDLA.jobs: New CDL-A carrier matching your profile in [region]. See: [short_link]
> Reply STOP to opt out.

**Match-event SMS (significant match list growth):**

> CDLA.jobs: Your match list just grew by [count]. New carriers in [region] hiring drivers like you: [short_link]
> Reply STOP to opt out.

**STOP confirmation:**

> CDLA.jobs: You're unsubscribed. No more texts from us. Reply HELP for support.

**HELP response:**

> CDLA.jobs: For help, email support@cdla.jobs. To unsubscribe, reply STOP. Msg & data rates may apply.

### 7.4 SMS frequency cap

Maximum **2 SMS per month per driver**. If multiple match-events fire in a single month, they collapse into one SMS summarizing the change. The 2/month cap is intentional — driver SMS fatigue is the #1 reason drivers reply STOP. Email can be more frequent; SMS cannot.

### 7.5 SMS timing

SMS sends only between **8am and 7pm local time** (driver's CDL state timezone). Never on weekends unless the match-event is genuinely time-sensitive (e.g., a Tier 1 exclusivity window starting). This is policy — TCPA technically allows wider windows, but driver expectations are tighter than the law.

---

## 8. Variable resolution and personalization

### 8.1 Variables this spec assumes are available

- `first_name`, `last_name`
- `region` (mapped from `cdl_state`)
- `equipment_preference` (driver's primary desired equipment from `desired_equipment` array)
- `match_count` (current carriers matching the driver)
- `new_carriers_count` (carriers added since the driver's intake)
- `new_carriers_matching_count` (subset of new_carriers_count matching the driver)
- `total_matches_shown` (lifetime count of carriers surfaced to this driver)
- `carriers_clicked_count` (lifetime count of carriers the driver clicked into)
- `intelliapps_started_count` (lifetime count)
- `intelliapps_completed_count` (lifetime count)
- `pay_median`, `pay_top_25_threshold`, `pay_bottom_25_threshold` (region+equipment pay benchmarks)
- `driver_min_pay` (driver's `min_weekly_pay` from intake)
- `carrier_name` (for post-hire emails: the carrier the driver was hired by)
- `short_link` (for SMS: shortened version of the destination URL)

### 8.2 Variable resolution failures

If a required variable can't be resolved (no carrier data, no pay benchmark, etc.), the email either:

- **Suppresses the conditional paragraph** that needs the variable (preferred)
- **Substitutes a fallback paragraph** if the suppression would leave the email empty
- **Skips sending entirely** if the email's core purpose depends on the missing variable

Example: Email 3 (Month 3) is the pay benchmark email. If `pay_median` can't be resolved (no carrier data in the driver's region/equipment), the email skips sending that month and the driver receives Email 4 a month later. The driver doesn't get a half-empty email or a "we don't have data for you" email.

### 8.3 No fake numbers ever

Per Brand Voice Guide: if a variable resolves to null or zero, the email handles it honestly, never fabricates a number. "0 new carriers this month" is OK as a stat; "approximately 3-5 new carriers" is not.

---

## 9. Unsubscribe handling

### 9.1 Mechanisms

- **Email unsubscribe link** in the footer of every nurture email
- **Reply STOP** to any SMS

Both routes lead to the same outcome: `unsubscribed_all` state for the driver. The driver receives no further nurture emails or SMS, ever, unless they explicitly re-consent.

### 9.2 Unsubscribe confirmation

After email unsubscribe click, driver is taken to a brief confirmation page:

> You're unsubscribed.
>
> No more CDLA.jobs emails. Your profile and match history are still saved — you can log back in any time and start matches again. We just won't email you in the meantime.
>
> Changed your mind? [Button: Resubscribe → /resubscribe]

After SMS STOP, the standard TCPA confirmation goes back (§7.3) and email unsubscribe is *also* triggered.

### 9.3 Re-subscription

A driver who unsubscribed can resubscribe via:

- Logging into their account and toggling nurture back on
- Replying START to a previous SMS (if SMS was the opt-in path originally)
- Re-completing intake (which counts as a new Stage 1 consent)

Re-subscription does **not** automatically resume the active-phase sequence from where it left off. The driver restarts at Email 1 of the active phase. Reason: a re-subscribed driver is functionally a new prospect — their situation likely changed during the unsubscribed period.

### 9.4 Suppression list

`unsubscribed_all` drivers go on a permanent suppression list. The GHL workflow build enforces this — any new nurture send checks the suppression list first. A driver on suppression cannot be re-added to nurture except via the explicit re-subscription mechanisms in §9.3.

---

## 10. Voice and tone for nurture

Same brand voice as elsewhere on CDLA.jobs, with three nurture-specific notes:

### 10.1 Nurture is less sarcastic than the intake / homepage

The driver opted in. They're a known relationship now, not a cold visitor. Industry sarcasm ("not the 14 recruiter calls a day for jobs you didn't ask about") is fine on the homepage where it differentiates CDLA.jobs from competitors. In nurture, that sarcasm reads as repetitive — the driver already chose us. Nurture is more direct, less performative.

### 10.2 First-person plural ("we") is OK in nurture

The intake uses first-person singular (Debbie says "I"). Nurture comes from "the CDLA.jobs team." Plural is more honest in this context — these emails come from a system, not from a single AI persona. Don't invent a fake persona for nurture emails.

### 10.3 Match the driver's situation, not the calendar

Variables should drive content. A driver with 0 matches gets different copy than a driver with 12 matches. A driver who's clicked into 5 carriers gets different copy than a driver who's clicked into 0. Don't send the same email to everyone in the cohort.

### 10.4 Things to avoid in nurture specifically

- "We hope this email finds you well" — empty filler, drivers skip it
- "Just checking in" as a subject line — vague, low open rate
- "Don't miss out" / "Last chance" / "Limited time" — fake urgency, dishonest
- Recapping what we already know about the driver in a way that sounds like a sales pitch
- Asking the driver to "rate us" — drivers don't have time, and survey requests feel transactional

---

## 11. Send time and timezone handling

### 11.1 Email send times

- **Monthly active-phase emails:** 10am driver's local time (CDL state timezone), on the day-of-week matching the driver's intake date
- **Maintenance match-event emails:** within 4 hours of the match event, 8am-7pm local
- **Quarterly educational emails:** first Monday of the quarter, 10am local time
- **Post-hire emails:** hire confirmation within 1 hour of the hire signal; month-3 check-in at 10am local

### 11.2 SMS send times

Per §7.5: 8am-7pm local, weekdays only unless time-sensitive.

### 11.3 Timezone resolution

Driver timezone is inferred from `cdl_state` (the 2-letter state code captured at Stage 1). States that span multiple timezones (Tennessee, Kentucky, Indiana, Michigan, etc.) default to the more populous timezone in the state. Driver can override timezone in account settings (v2 feature).

---

## 12. Open questions for attorney review

### 12.1 TCPA frequency disclosure

Monthly email cadence plus up to 2 SMS per month for opted-in drivers — is this within the scope of the Stage 1 consent language, or does the consent need to disclose specific frequency expectations? See Attorney Brief Addendum v1, Question 1.

### 12.2 Post-hire email content under per-carrier consent

The hire confirmation email names the carrier ("[Carrier name] confirmed you started with them. Congrats."). The driver consented at Stage 2 to share their prequalification with that carrier — does the resulting hire-confirmation email need additional consent for CDLA.jobs to acknowledge the hire? Should the carrier's name be omitted, or is the carrier-named acknowledgment fine because the driver knew the carrier they were applying to? See Attorney Brief Addendum v1, Question 4 (related).

### 12.3 Channel-specific unsubscribe

Current spec treats STOP-to-SMS as a full unsubscribe (email and SMS both cease). Is channel-specific opt-out (stop SMS but keep email) required under TCPA or any state law? Or is the all-or-nothing simplicity acceptable?

### 12.4 Auto-resume after post-hire pause

The auto-resume to maintenance cadence at month 7, without checking with the driver, may surface CDLA.jobs to a driver who's no longer interested or who is still at the placement carrier and doesn't want competing offers. Any legal issue with this, or is it purely a UX / brand consideration?

---

## 13. Open questions for the GHL workflow build

### 13.1 Trigger logic

The match-event emails (§5.2) and significant-match-growth SMS (§7.3) need GHL workflow triggers tied to match engine events. Open: does the matching engine emit webhooks GHL can consume, or does GHL poll? Implementation detail belonging in the GHL Workflow Spec and Core Technical Spec.

### 13.2 Granular pause state

`paused_user_request` exists in the state machine but isn't user-triggerable in v1 (no `/pause` UI). Email 5 (Month 5) references a pause button — that paragraph is suppressed in v1 per the spec note. Adding pause as a real v2 feature requires UI work, GHL workflow updates, and a re-test of the state machine.

### 13.3 Hire signal reliability

The transition from `active` to `paused_post_hire` depends on a reliable "this driver got hired" signal from Tenstreet or wherever the carrier reports back. If the signal is unreliable (delayed, missed, false positives), drivers may continue receiving active nurture after hire, or get prematurely paused. The Tenstreet integration spec covers this; it's referenced here so the dependency is visible.

### 13.4 Dormant sub-state

§5.5 introduces a `dormant` sub-state for drivers who've been active for 18+ months without engagement. This is loosely specced — the GHL workflow build needs to operationalize the "dormant" classification and the quarterly-only send pattern.

---

## 14. What this document does not cover

- Transactional emails (intake confirmation, match alerts, IntelliApp completion follow-up) — separate specs
- Carrier nurture sequence (12-month) — separate spec
- Prospect carrier outreach email — separate spec
- GHL workflow technical specs (trigger config, conditional logic in the GHL platform itself) — separate spec
- Email template HTML / design — design phase, not copy
- A/B test methodology and winner selection criteria — operational decision

---

## 15. Change log

| Date | Change | By |
|------|--------|-----|
| 2026-05-19 | v1 created | Todd + Claude |

---

*End of spec.*
