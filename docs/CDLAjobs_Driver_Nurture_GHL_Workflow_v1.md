# Driver Nurture Sequence — GHL workflow build v1

This document gives you everything you need to build the 6-email driver nurture sequence inside GoHighLevel using the contact tag we already apply at intake (`driver-intake-completed`).

**Simplifications from spec:** Only `first_name`, `city`, and `state` are used as template variables — these are populated on the GHL contact by `/api/intake`. The data-heavy variables in the spec (match counts, pay benchmarks, new-carrier counts) are deferred to v2 when we add the pipeline to push those values to GHL on a schedule.

**Send timing:** the spec calls for sending on the same day-of-week as the driver's intake at ~10am local time. GHL's "Wait" node with day-of-week and time-of-day constraints handles this — wait for the next driver-intake-day at 10am driver-state time.

---

## 1. GHL workflow structure

Build one workflow per the diagram below. All nodes live inside the same workflow; the "Wait" nodes hold the contact between emails. Driver state changes (unsubscribe, hire confirmation) exit the sequence via condition checks before each send.

```
[Trigger: Contact Tag Added = "driver-intake-completed"]
  ↓
[Wait 30 days]
  ↓
[If/Else: contact has tag "unsubscribed-all" or "driver-hired"]
  ├── YES → END
  └── NO  → [Send Email 1: Month 1 — Match update]
              ↓
            [Wait 30 days]
              ↓
            [If/Else: unsubscribed or hired]
              ├── YES → END
              └── NO  → [Send Email 2: Month 2 — Re-engagement]
                        ↓
                      (...repeat for emails 3, 4, 5, 6...)
                        ↓
                      [Send Email 6: Month 6 — Six-month check-in]
                        ↓
                      END
```

For v1, skip the post-hire pause and 12-month re-engagement — those need hire-confirmation infrastructure that doesn't exist yet.

---

## 2. Variables available

All six emails use only these merge tags (already populated on the GHL contact by `/api/intake`):

| GHL merge tag | Value | Fallback if missing |
|---|---|---|
| `{{contact.first_name}}` | Driver's first name | "there" |
| `{{contact.city}}` | Driver's home city (e.g., "Denver") | omit the city line |
| `{{contact.state}}` | Full state name (e.g., "Colorado") | "your area" |

**"See your matches" CTA link** for all six emails: `https://cdla.jobs/login` (or `https://cdla-job-finder.vercel.app/login` until DNS clears). The driver enters their email, gets a Stytch magic link, lands on their matches page.

---

## 3. Email 1 — Month 1 (Match update)

**Send timing:** 30 days after `driver-intake-completed` tag added.

**Subject (A/B — run both until 200 sends, pick winner by CTR):**

- A: `New CDL-A carriers in {{contact.state}} this month`
- B: `What's new in {{contact.state}} for CDL-A drivers`

**Preview text:** A look at what's matching, what's new, and what to do if nothing fits yet.

**HTML body:**

```html
<p>Hey {{contact.first_name}} &mdash;</p>

<p>It&rsquo;s been about a month since you finished your intake. Here&rsquo;s where things stand.</p>

<p><strong>The matching engine has been watching {{contact.state}} for you.</strong> New carriers join the platform every week, and equipment / region coverage grows steadily. Worth a look to see what&rsquo;s matching for you right now.</p>

<p style="margin: 24px 0;">
  <a href="https://cdla.jobs/login" style="display: inline-block; background: #1F3A5F; color: #ffffff; padding: 12px 22px; border-radius: 6px; font-weight: 600; text-decoration: none;">See my matches</a>
</p>

<p>If your situation has changed &mdash; new endorsements, more flexibility on region or equipment, different pay floor &mdash; update your preferences and we&rsquo;ll re-run the match. Takes about a minute.</p>

<p style="margin: 16px 0;">
  <a href="https://cdla.jobs/intake" style="color: #2E5C8A; text-decoration: underline; font-weight: 500;">Update my preferences</a>
</p>

<p>If you&rsquo;re already in conversation with a carrier we matched you with, ignore this. Just checking in.</p>

<p style="margin-top: 22px;">&mdash; The CDLA.jobs team</p>
```

---

## 4. Email 2 — Month 2 (Re-engagement)

**Send timing:** 60 days after intake (30 days after Email 1).

**Subject (A/B):**

- A: `Anything change since we last talked?`
- B: `Your CDLA.jobs profile, 60 days in`

**Preview text:** A quick check-in — and an honest read on what's matching.

**HTML body:**

```html
<p>Hey {{contact.first_name}} &mdash;</p>

<p>60 days in. Two questions:</p>

<p><strong>1. Has anything changed?</strong> Driver life moves fast. New equipment certification, new endorsement, you got tired of OTR and want something local, you&rsquo;re open to a different region &mdash; any of these changes how we match you. Takes a minute to update.</p>

<p style="margin: 16px 0;">
  <a href="https://cdla.jobs/intake" style="display: inline-block; background: #1F3A5F; color: #ffffff; padding: 12px 22px; border-radius: 6px; font-weight: 600; text-decoration: none;">Update my preferences</a>
</p>

<p><strong>2. Are you actually looking right now?</strong> Sometimes drivers intake when they&rsquo;re curious, not ready. If you&rsquo;re not actively looking, no problem &mdash; we&rsquo;ll keep watching for you in the background. If you want us to stop emailing until you&rsquo;re ready, hit the unsubscribe link below and come back when the time&rsquo;s right.</p>

<p>Either way, here&rsquo;s what&rsquo;s matching for you in {{contact.state}} right now:</p>

<p style="margin: 16px 0;">
  <a href="https://cdla.jobs/login" style="color: #2E5C8A; text-decoration: underline; font-weight: 500;">See my matches</a>
</p>

<p style="margin-top: 22px;">&mdash; The CDLA.jobs team</p>
```

---

## 5. Email 3 — Month 3 (Educational)

**Send timing:** 90 days after intake.

**Subject (A/B):**

- A: `Real talk on CDL-A hiring in {{contact.state}} right now`
- B: `Three months in &mdash; what we&rsquo;re seeing in {{contact.state}}`

**Preview text:** What's actually happening in the {{contact.state}} CDL-A market — pay, lanes, demand.

**HTML body:**

```html
<p>Hey {{contact.first_name}} &mdash;</p>

<p>Three months in. Quick read on what&rsquo;s happening in the {{contact.state}} CDL-A market right now.</p>

<p>Pay across {{contact.state}} is shifting on most equipment types &mdash; some carriers are tightening, others are pushing rates up to fill seats. The middle of the market still moves more drivers than either end, and the carriers we work with publish their actual pay ranges instead of dollar-sign emojis on a job board.</p>

<p>Lanes are turning over too. Dedicated routes that didn&rsquo;t exist six months ago are showing up; some OTR runs that used to be steady are softening. The carriers in our network update their hiring criteria as freight shifts, so the match list you saw at intake isn&rsquo;t the same one running today.</p>

<p style="margin: 24px 0;">
  <a href="https://cdla.jobs/login" style="display: inline-block; background: #1F3A5F; color: #ffffff; padding: 12px 22px; border-radius: 6px; font-weight: 600; text-decoration: none;">See what&rsquo;s matching now</a>
</p>

<p>If you have a pay floor in mind that the market hasn&rsquo;t hit yet, hold it. If you&rsquo;re flexible and you&rsquo;d rather see options, drop the floor on your profile by $100/week and re-run.</p>

<p style="margin: 16px 0;">
  <a href="https://cdla.jobs/intake" style="color: #2E5C8A; text-decoration: underline; font-weight: 500;">Update my preferences</a>
</p>

<p style="margin-top: 22px;">&mdash; The CDLA.jobs team</p>
```

---

## 6. Email 4 — Month 4 (Match update)

**Send timing:** 120 days after intake.

**Subject (A/B):**

- A: `Four months in &mdash; here&rsquo;s what&rsquo;s changed in {{contact.state}}`
- B: `New carriers since you started`

**Preview text:** New carriers, new matches, and a question.

**HTML body:**

```html
<p>Hey {{contact.first_name}} &mdash;</p>

<p>Four months in. Carrier list in {{contact.state}} has turned over since you intaked &mdash; new operators came online, some old ones tightened their criteria, lanes shifted.</p>

<p style="margin: 24px 0;">
  <a href="https://cdla.jobs/login" style="display: inline-block; background: #1F3A5F; color: #ffffff; padding: 12px 22px; border-radius: 6px; font-weight: 600; text-decoration: none;">See my current matches</a>
</p>

<p>One question if you have a sec: anything specific you wish CDLA.jobs did differently? Reply to this email &mdash; it&rsquo;s a real inbox, not a no-reply.</p>

<p style="margin-top: 22px;">&mdash; The CDLA.jobs team</p>
```

---

## 7. Email 5 — Month 5 (Re-engagement)

**Send timing:** 150 days after intake.

**Subject (A/B):**

- A: `Five months in &mdash; quick check`
- B: `Are we still useful, or should we step back?`

**Preview text:** Honest question. If we're not, we'd rather know.

**HTML body:**

```html
<p>Hey {{contact.first_name}} &mdash;</p>

<p>Five months since intake. Honest question: is CDLA.jobs still useful to you?</p>

<p>If you&rsquo;re still looking and we&rsquo;re not delivering matches that fit, that&rsquo;s on us &mdash; and we&rsquo;d want to know. Reply to this email and tell us what&rsquo;s not working. We read every reply.</p>

<p>If you&rsquo;re still looking and we are delivering matches but nothing&rsquo;s converted to a hire, the matching is working but the interviews aren&rsquo;t landing. That&rsquo;s usually a fit issue with the specific carriers, not a profile issue with you. Sometimes worth updating your preferences to widen the pool a bit.</p>

<p style="margin: 16px 0;">
  <a href="https://cdla.jobs/intake" style="display: inline-block; background: #1F3A5F; color: #ffffff; padding: 12px 22px; border-radius: 6px; font-weight: 600; text-decoration: none;">Update my preferences</a>
</p>

<p>If you&rsquo;re not looking anymore &mdash; you found something off-platform, you decided to stay where you are, you&rsquo;re taking a break from driving &mdash; just hit unsubscribe below. No hard feelings.</p>

<p>Or take a quick look at what&rsquo;s matching today:</p>

<p style="margin: 16px 0;">
  <a href="https://cdla.jobs/login" style="color: #2E5C8A; text-decoration: underline; font-weight: 500;">See my matches</a>
</p>

<p style="margin-top: 22px;">&mdash; The CDLA.jobs team</p>
```

---

## 8. Email 6 — Month 6 (Educational + re-engagement)

**Send timing:** 180 days after intake. Last email in the sequence for v1.

**Subject (A/B):**

- A: `Six months in &mdash; what we&rsquo;ve learned`
- B: `Half a year on CDLA.jobs`

**Preview text:** Six months in. Where we go from here.

**HTML body:**

```html
<p>Hey {{contact.first_name}} &mdash;</p>

<p>Six months on CDLA.jobs. Here&rsquo;s what we&rsquo;re going to do from here.</p>

<p>From this point on, we&rsquo;re going to dial back the email cadence to keep you in the loop without flooding your inbox. We&rsquo;ll send updates when something specific changes &mdash; new carrier in {{contact.state}}, big shift in pay benchmarks, or anything else worth your attention.</p>

<p>In the meantime, if you&rsquo;re still looking, two things that usually move the needle:</p>

<p><strong>1. Update your preferences.</strong> Six months can change a lot &mdash; new endorsements, new tolerance for relocation, different pay floor. Refreshing your profile re-runs the match against the current carrier pool, which has turned over a lot since you started.</p>

<p style="margin: 16px 0;">
  <a href="https://cdla.jobs/intake" style="color: #2E5C8A; text-decoration: underline; font-weight: 500;">Update my preferences</a>
</p>

<p><strong>2. Check your match list one more time.</strong> The carriers actively hiring CDL-A drivers in {{contact.state}} this month look different from the ones we showed you six months ago.</p>

<p style="margin: 24px 0;">
  <a href="https://cdla.jobs/login" style="display: inline-block; background: #1F3A5F; color: #ffffff; padding: 12px 22px; border-radius: 6px; font-weight: 600; text-decoration: none;">See my matches</a>
</p>

<p>If you&rsquo;d rather we stop, just unsubscribe below. No problem.</p>

<p style="margin-top: 22px;">&mdash; The CDLA.jobs team</p>
```

---

## 9. Step-by-step build in GHL

For each of the six emails:

1. **GHL → Marketing → Emails → New Template** → name it `Driver Nurture — Email N`
2. Paste the subject (use A/B testing inside the template if your GHL plan supports it; otherwise pick one)
3. Paste the preview text in the meta-description field
4. Open the HTML editor and paste the HTML body above

For the workflow:

1. **GHL → Automation → Workflows → New Workflow** → name it `Driver Nurture — 6 Month Active Sequence`
2. **Trigger:** Contact Tag → "Tag added" → tag = `driver-intake-completed`
3. Add **Wait 30 days**
4. Add **If/Else** → "Contact has tag" → tag = `unsubscribed-all` OR `driver-hired`
   - YES branch → End workflow
   - NO branch → continue
5. Add **Send Email** → select `Driver Nurture — Email 1`
6. Repeat steps 3–5 for emails 2 through 6.
7. **Publish** the workflow (top-right toggle).

---

## 10. What's not in v1 (defer to v2)

- **Match-count, new-carrier-count, pay-benchmark variables** in email bodies. Spec calls for these; we don't have the GHL→app→GHL data refresh pipeline yet. Templates skip these for now.
- **Post-hire pause + resume sequence** (spec §6). Needs a hire-confirmation signal (Tenstreet webhook or similar). Out of scope.
- **Month-12 and Month-18 re-engagement** (spec §5.4–5.5). Add when month-6 sequence proves out.
- **SMS counterparts** (spec §7). Email-only for v1 to stay under TCPA SMS frequency caps until volume justifies the SMS infrastructure.
- **Reverse-match alerts** (separate spec). Event-driven, requires "new carrier matches existing driver" detection logic. Out of scope.
- **Send-time-of-day optimization** (spec §4.1 — same day-of-week as intake, 10am driver-state local). GHL workflow `Wait` nodes support this via time-of-day + day-of-week constraints; configure if you want it. Default behavior without those constraints is "send when the delay expires," which is good enough for v1.

---

## 11. Change log

| Date | Change | By |
|------|--------|-----|
| 2026-05-25 | v1 created — 6 emails simplified for v1 launch | Todd + Claude |
