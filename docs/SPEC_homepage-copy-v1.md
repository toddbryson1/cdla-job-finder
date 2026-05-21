# CDLA.jobs Homepage Copy Spec — v1

**Version:** 1.0
**Status:** Locked (pending attorney review of consent-language placeholders)
**Audience:** Internal — product, engineering, content writers, designers
**Owner:** Todd Bryson
**Companion documents:** Brand Voice Guide v1, Conversational AI Intake Spec v1, Driver Landing Page Template v1

---

## 1. Purpose

This document specifies the copy and structure for the CDLA.jobs homepage (`cdla.jobs/` and `www.cdla.jobs/`). The homepage is the platform's primary front door — drivers landing from organic search, paid ads, social referrals, and direct traffic all arrive here unless they land on a region/equipment-specific landing page.

The homepage's job is to convert visitors into Debbie conversations. Every section below either drives the visitor toward the chatbox or supports the trust framing that makes a visitor willing to engage with an AI on their first encounter with the brand.

---

## 2. Strategic context

CDLA.jobs is in **beta** at launch. We don't yet have a meaningful partner carrier count, driver testimonials, or hire numbers to publish. The homepage must work without those trust signals — relying instead on product-truth claims (free, no data sale, fast match, real carriers) and on the credibility of being honest about being new.

The homepage is **driver-first**. Carriers are addressed in a small section near the bottom and otherwise reach CDLA.jobs through outbound sales, referrals, and the dedicated `/partners` landing pages. The homepage does not try to serve both audiences in equal measure.

Brand voice on this page: warm, driver-first, direct, lightly sarcastic toward Indeed and lead farms, never sarcastic toward the driver. Per Brand Voice Guide v1.

---

## 3. Page structure

Sections render top to bottom on the page:

1. Hero (chatbox + headline + subhead + trust microcopy)
2. How it works (three steps)
3. Why CDLA.jobs is different (four product-truth claims)
4. For carriers (small mini-section, near bottom)
5. Footer (legal, links, address, soft beta acknowledgment)

The page is mobile-first. Most drivers will visit on a phone. The chatbox must be visible above the fold on an iPhone SE (the narrowest mainstream phone in active use) without the user having to scroll.

---

## 4. Section 1 — Hero

### 4.1 Layout

Two-column on desktop, single-column on mobile:

- **Left column (desktop) / Top (mobile):** headline, subhead, trust microcopy
- **Right column (desktop) / Below copy (mobile):** chatbox with Debbie's opening message visible

The chatbox is the centerpiece. The copy supports it. Designers should not push the chatbox below the fold on any common viewport.

### 4.2 Headline

> Find your next driving job in five minutes.

Set in a large, readable sans-serif weight. No emojis. No exclamation point. Period at the end is intentional — it's a statement, not a sales pitch.

### 4.3 Subhead

> Talk to Debbie. Tell her what you want. She matches you to carriers hiring right now — without the 20-page applications or the recruiter spam.

The subhead does three things in one sentence: introduces Debbie by name (sets the AI expectation), describes the action (talk, tell), and signals the differentiator (no applications, no spam). The em-dash break is intentional — it gives the eye a place to land before the sarcasm-toward-industry kicker.

### 4.4 Trust microcopy

Directly below the subhead, in smaller type:

> Free for drivers. We don't sell your information. Match in five minutes.

Three short claims. Each one is a product truth that requires no real-world numbers to support. Read as a single line on desktop, may wrap on mobile.

### 4.5 Chatbox

The chatbox itself is specified in the Conversational AI Intake Spec v1 (Section 4.1). For homepage purposes, the design requirement is:

- Visible above the fold on iPhone SE viewport (375px wide)
- Debbie's opening message pre-rendered so the visitor sees a conversation has already started ("Hey — I'm Debbie, the AI driver matcher at CDLA.jobs. I'll ask a few quick questions, then show you carriers that fit what you want. Five minutes, max. You can talk or type, or upload your resume if that's easier.")
- Microphone icon, paperclip icon, and "I'd rather fill out a form" link all visible from initial render
- Input field has a placeholder: `Type your answer, or tap the mic to talk.`

### 4.6 Hero fallback for users with JavaScript disabled

A small percentage of visitors will have JavaScript disabled or blocked. The chatbox won't render. For these visitors:

- Replace the chatbox with a button linking to the 6-step form fallback (`/intake-form`)
- Button label: "Start the form"
- Brief explanatory text above button: "Looks like the chat can't load. The form works just as well."

This is graceful degradation, not the primary experience.

---

## 5. Section 2 — How it works

### 5.1 Section headline

> How it works

Plain. No marketing flourish. The headline labels the section so visitors can find it.

### 5.2 Three steps

Each step has a short header and one sentence of body copy. Iconography optional — if used, must be simple line icons in the CDLA.jobs brand colors, no stock illustrations.

**Step 1 — Tell Debbie what you want.**
Five minutes. Talk, type, or upload your resume.

**Step 2 — See your matches.**
Carriers hiring drivers like you, ranked by fit. No applying to 40 places.

**Step 3 — Pick the carriers you want.**
They contact you. You decide who gets your info. Nobody gets sold your number.

### 5.3 Voice notes

- "Pick the carriers you want" puts the driver in control. This is intentional. Drivers feel ground down by job platforms that decide for them.
- "Nobody gets sold your number" is a direct shot at lead farms (the implied competitor). The brand voice allows industry sarcasm; this line lands within those guardrails.
- Each step is two sentences max. Mobile readers do not tolerate longer.

---

## 6. Section 3 — Why CDLA.jobs is different

### 6.1 Section headline

> Why CDLA.jobs is different

### 6.2 Four product-truth claims

Each claim is a short headline (3-6 words) and one sentence of explanation. Display as a 2x2 grid on desktop, stacked on mobile.

**Free for drivers.**
You don't pay us anything. Carriers do — but only the ones that want priority access. Drivers always pay zero.

**We don't sell your data.**
Your information goes to carriers you pick. Not to a panel of buyers. Not to "marketing partners." Not to anyone you didn't choose.

**Match in five minutes.**
Debbie asks a handful of questions and shows you carriers actually hiring drivers like you. No 20-page applications until you're ready to apply to a specific carrier.

**Real carriers, not a lead farm.**
Every carrier in our system is hiring. If they're not, they're not in our system. We don't pad the results.

### 6.3 Voice notes

- "Carriers always pay zero" replaces the more typical "always free for drivers" because it's more specific and tells the visitor *who* pays. Specifics build trust.
- The data-sale claim explicitly names the alternative ("a panel of buyers," "marketing partners") because drivers know what those phrases mean. The brand voice rule is "specific over vague."
- "We don't pad the results" is the closest the homepage gets to direct sarcasm at competitors. It's general enough to be defensible but specific enough to land.

---

## 7. Section 4 — For carriers (mini-section)

### 7.1 Purpose

Carriers visiting CDLA.jobs need a path forward. Without this section, the homepage is 100% driver-facing and carriers either leave or use the contact form. A small, low-key block near the bottom is enough.

### 7.2 Layout

Single block, full width, distinct from the driver-facing sections above (different background color, smaller type). Reads as a footer-adjacent section, not as a primary call-to-action.

### 7.3 Copy

**Hiring CDL-A drivers?**

We send matched driver prequalifications to your ATS. Drivers choose to share their info with you — not a lead panel. Free at Tier 2; $2,500/month for 24-hour exclusivity. No per-hire fees, no setup fees.

**Two buttons:**
- "Integration" → links to `/partners/integration`
- "Exclusivity" → links to `/partners/exclusivity`

### 7.4 Voice notes

- Carrier-facing voice per Brand Voice Guide §4: professional, credible, specific.
- Price visible immediately. No vague "contact us for pricing."
- Two button options match the two carrier landing page tracks already in the doc set.

---

## 8. Section 5 — Footer

### 8.1 Layout

Standard four-column footer on desktop, stacked on mobile.

### 8.2 Column 1 — Brand

- CDLA.jobs logo
- One-line tagline: "Class A driver matching. Built for drivers."

### 8.3 Column 2 — For drivers

- How it works → anchor link to Section 2
- Talk to Debbie → opens the chatbox / re-anchors to hero
- Form fallback → `/intake-form`
- FAQ → `/faq` `[PLACEHOLDER — FAQ page pending]`

### 8.4 Column 3 — For carriers

- Integration → `/partners/integration`
- Exclusivity → `/partners/exclusivity`
- Contact → `/contact` `[PLACEHOLDER — contact page pending]`

### 8.5 Column 4 — Company & legal

- About → `/about` `[PLACEHOLDER — About page in development as a separate document]`
- Privacy Policy → `/privacy` `[PLACEHOLDER — pending attorney review]`
- Terms of Service → `/terms` `[PLACEHOLDER — pending attorney review]`

### 8.6 Below-columns row

A single line spanning the full width below the columns:

> CDLA.jobs is new. We're matching drivers and adding carriers daily.

This is the soft beta acknowledgment. It's not a "BETA" badge. It's an honest line that turns the platform's newness into a credibility signal rather than hiding it. Drivers respect honesty more than they respect inflated claims.

### 8.7 Bottom legal row

Smallest type, full width:

> © 2026 CDLA.jobs. [PHTP physical address — see open question §10.1]. CDLA.jobs sends SMS and email to drivers who consent to receive them. Reply STOP to any text to opt out. Click unsubscribe in any email to opt out.

The STOP / unsubscribe disclosure is required per the existing attorney brief's SMS consent framework. It belongs in the footer of every page where drivers might have opted in to communications.

---

## 9. SEO and meta tags

### 9.1 Title tag

> CDLA.jobs — Class A driver matching. Built for drivers.

### 9.2 Meta description

> Find your next CDL-A driving job in five minutes. Talk to Debbie, our AI driver matcher. Real carriers, no recruiter spam. Free for drivers.

### 9.3 Open Graph and Twitter cards

- Same title and description
- Image: CDLA.jobs branded card, 1200x630, "Find your next driving job in five minutes" as overlay text. No stock photos of trucks unless brand-approved.

### 9.4 Canonical URL

`https://cdla.jobs/`

Both `cdla.jobs` and `www.cdla.jobs` resolve here. 301 redirect from whichever isn't the canonical.

### 9.5 Schema.org structured data

- Organization schema for CDLA.jobs (name, URL, logo, sameAs links if social profiles exist)
- WebSite schema with sitelinks search action (optional — only if `/jobs/[region]-[equipment]` URLs are intended to surface in Google sitelinks)

Do **not** include JobPosting schema on the homepage. JobPosting belongs on individual job pages only, per Google's documentation.

---

## 10. Open questions

### 10.1 Footer address

CDLA.jobs operates under a referral agreement with PHTP. The footer address question:

- Use PHTP's existing physical address at launch (operationally simplest, but visible to anyone who inspects the footer)
- Use a separate CDLA.jobs entity address (requires entity setup and a mailing address before launch)

**Recommendation:** use PHTP's address at launch, flag for migration to a CDLA.jobs entity address once the entity is formalized. This question is connected to the attorney brief's Question 6 (cross-entity disclosure).

### 10.2 About page

The About page is a separate document in the queue. Footer link currently a placeholder pending that draft. Open question for the About page itself: does it acknowledge the PHTP referral relationship, or stay silent? See attorney brief Question 6.

### 10.3 Privacy and Terms

Both pages are placeholders pending attorney drafting. Footer links must resolve to real pages before launch.

### 10.4 FAQ page

The Driver Landing Page Template includes a FAQ pattern. The homepage footer references a `/faq` page, but no consolidated FAQ exists yet. Decision needed: build a standalone `/faq`, or remove the link from the footer and rely on the per-landing-page FAQ sections.

### 10.5 Hero image / illustration

Not specified in this document. Designers may add a visual element to the right column (alongside or behind the chatbox) but must not:

- Use stock photos of generic businesspeople or generic trucks
- Use AI-generated faces of fake drivers
- Use clip-art truck illustrations
- Crowd the chatbox out of above-the-fold space

If a visual is added, it should be brand-spare (lines, geometric shapes, a real CDLA.jobs brand element) or omitted entirely. Brand integrity over decoration.

### 10.6 Carrier section trust signals

The "For carriers" mini-section has no trust signals (partner count, hire numbers, testimonials) at launch because no real data is available yet. Same as the driver-facing trust signals. Add real numbers as they become available, in a future v2 of this document.

---

## 11. What this document does not cover

- About page copy (separate document, in queue)
- Privacy Policy text (attorney-drafted)
- Terms of Service text (attorney-drafted)
- FAQ page copy (decision pending per §10.4)
- Contact page copy (small standalone page, lower priority)
- 404 / error page copy (future v2)
- Loading states, transitions, microinteractions (design spec, not copy)
- Email confirmation pages post-intake (Driver Nurture Sequence covers some of this)

---

## 12. Build notes for engineering

- Page is server-rendered (Next.js or equivalent) for SEO, with the chatbox hydrating client-side
- Chatbox initial state pre-rendered as HTML so the opening message is visible before JavaScript loads
- All copy in this document is the canonical version. Do not improvise headlines or microcopy.
- A/B testing is welcome on the headline and the "How it works" copy, but variants must come from a written brief, not from designer/engineer improvisation
- Track: scroll depth, chatbox engagement rate (% of visitors who type or speak the first message), conversion to Stage 1 consent

---

## 13. Change log

| Date | Change | By |
|------|--------|-----|
| 2026-05-19 | v1 created | Todd + Claude |

---

*End of spec.*
