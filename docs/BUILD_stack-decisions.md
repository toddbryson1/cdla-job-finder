# Stack Decisions — CDLA.jobs

**Version:** 1.0
**Status:** Recommendations for review and decision — not yet locked
**Audience:** Internal — engineering, product, Todd
**Owner:** Todd Bryson
**Companion documents:** Core Technical Spec v5 [STUB], Conversation Orchestrator Spec [STUB], Conversational AI Intake Spec v1

---

## 1. Purpose

This document recommends concrete stack choices for the five external service decisions surfaced in this session's spec work:

1. LLM provider for Debbie's conversational intake
2. Transcription provider for Debbie's audio input
3. SMS provider for nurture and alert SMS
4. Calendar booking tool for sales CTAs
5. Magic-link authentication approach for returning driver login

Each section includes the recommendation, the honest reasoning, the runner-up, and what would change my mind. **All recommendations are my opinion based on publicly available information and the project's specific requirements. None are formal vendor evaluations.** Final decisions are Todd's and may involve factors I don't have visibility into (existing contracts, account relationships, team familiarity, etc.).

---

## 2. LLM provider for Debbie

### 2.1 Recommendation

**Anthropic Claude — specifically Claude Sonnet 4.6 as the primary model, with Claude Haiku 4.5 as the fallback for cost-sensitive operations.**

Estimated cost per Debbie intake conversation: $0.02–$0.05 per driver at Sonnet 4.6 rates ($3/M input, $15/M output), assuming ~3,000 input tokens per turn and ~10 turns per intake. Probably closer to $0.02 in practice once prompt caching is applied.

### 2.2 Reasoning

Three reasons:

1. **Instruction-following accuracy for conversation orchestration.** Debbie has a structured job — collect specific fields, route to consent, handle edge cases per spec, maintain brand voice consistently. Independent benchmarks show Claude's family leading on instruction-following and hard prompts. For a regulated industry where Debbie's wording matters legally (per attorney brief addendum), instruction-following is the most important capability.

2. **The brand voice rules are constitutional, not just stylistic.** Debbie is not allowed to say certain things (no fake humanness, no opinions on specific carriers, no apologies for being AI, etc.). Claude's training favors holding to system-prompt constraints over generating "helpful" responses that violate them. Anecdotal but consistent in real-world reports.

3. **Pricing landed where it needed to.** As of April 2026, Claude Sonnet 4.6 is $3/M input, $15/M output. Haiku 4.5 is $1/M input, $5/M output. Both are within budget for a conversational intake at modest driver volume.

### 2.3 Runner-up

**OpenAI GPT-5.4 or GPT-5-mini.**

- GPT-5-mini is cheaper at scale ($0.25/M input territory) and faster — measurably better for high-volume simple turns.
- GPT-5.4 is competitive with Claude on most tasks; better on multimodal and ecosystem breadth.
- Operator and computer-use capabilities aren't relevant for Debbie's use case, so GPT's ecosystem advantage there doesn't apply.

Why I didn't pick: GPT models tend to be slightly more agreeable / sycophantic in conversational settings (well-documented OpenAI postmortem from April 2025). For an intake collecting safety-critical disclosures from drivers, slight pushback on inconsistencies and "let me confirm what I heard" behavior is a feature, not a bug. Claude's tendency to verify rather than smooth-over fits the use case better.

### 2.4 What would change my mind

- If you have an existing OpenAI relationship (Azure OpenAI, enterprise deal, team familiarity) that materially reduces friction, the runner-up becomes the pick
- If cost-per-conversation needs to be aggressively minimized at scale (10K+ intakes per month), GPT-5-mini's per-token pricing wins
- If you want to use the same provider for both conversational intake and resume parsing in one provider relationship, Claude is arguably stronger on long-document analysis but GPT-5.4 with vision works well too

### 2.5 What I'd avoid

- **Gemini for conversational intake at this stage.** Gemini's API has gone through enough pricing changes recently that locking in a model with shifting cost structure carries planning risk. Google's strengths are elsewhere.
- **Self-hosted open-source models** (Llama, etc.). The engineering overhead to maintain a production LLM serving layer is significant. Not worth it for a regulated-industry conversational intake unless you're already running ML infrastructure for other reasons.

### 2.6 Implementation note

Don't hard-code one model. Build the orchestrator so the LLM provider is swappable via configuration. The router pattern (cheaper model for simple turns, expensive model for complex turns) becomes valuable as conversation volume scales.

---

## 3. Transcription provider for Debbie's audio input

### 3.1 Recommendation

**Deepgram Nova-3 for production, with OpenAI Whisper API as the fallback option to evaluate during build.**

Estimated cost: Deepgram pricing starts around $0.0043/minute for basic transcription. A 4-minute Debbie conversation at audio-input rates costs roughly $0.02. OpenAI Whisper API is $0.006/minute (~$0.024 per 4-minute conversation).

### 3.2 Reasoning

Three reasons:

1. **Low latency matters for the chat UX.** Debbie's audio input flow is: driver speaks → audio captured → transcribed → text appears in input field for review → driver edits if needed → submits. The transcription latency directly affects how natural the chat feels. Deepgram's Nova-3 is purpose-built for low-latency real-time transcription with sub-300ms streaming latency.

2. **The brand voice spec requires honest "I didn't catch that" handling when transcription is uncertain.** Deepgram provides word-level confidence scores, which lets the conversation orchestrator decide when to ask for confirmation vs. trust the transcription. Whisper provides limited confidence information.

3. **American English accents.** Drivers come from across the US with regional accents. Deepgram performs well on real-world conversational US English audio (it's their primary training optimization). Whisper handles accents well too but is sometimes hallucination-prone on low-activity audio (long pauses, background road noise).

### 3.3 Runner-up

**OpenAI Whisper API ($0.006/minute).**

- Simplest integration — single API call, well-documented, broad community knowledge
- Same provider relationship if you're using GPT for LLM (which is the runner-up for LLM choice)
- Open-source self-hosting option if cost or compliance ever requires it
- Lower accuracy on streaming/real-time (Whisper API is batch-oriented, not streaming-first)

### 3.4 What would change my mind

- **If audio input drops to a minority feature in practice.** If most drivers type instead of speak, the transcription quality difference becomes invisible. Whisper API at $0.006/min is simpler and "good enough" for occasional voice.
- **If the conversation orchestrator handles transcription async and the latency advantage of Deepgram isn't needed in the UX.** Then Whisper wins on simplicity.
- **If you want a single-vendor relationship for LLM + transcription** with OpenAI, Whisper is the integrated choice.

### 3.5 What I'd avoid

- **AssemblyAI for this use case.** Their pricing model has add-ons that stack quickly (diarization, sentiment, etc.). Debbie doesn't need most of those features. The base rate is competitive but the effective rate climbs fast once you start adding capabilities, and the temptation to use those capabilities is real.
- **Cloud-platform STT (Google Cloud Speech, AWS Transcribe, Azure Speech).** Add infrastructure overhead and per-provider quirks that aren't worth it for a specialized application.

### 3.6 Compliance note

Per Conversational AI Intake Spec §6.5 and Attorney Brief Addendum Question 2, voice transcription introduces biometric data handling considerations under BIPA, CUBI, Washington biometric law. Whichever provider is selected, the data-handling agreement must include:

- Where audio is processed (US-only is safer than EU/global routing)
- How long raw audio is retained (immediate-deletion-after-transcription is preferable)
- Subprocessor disclosure
- BAA-style availability if you ever serve regulated industries (not strictly needed for trucking but useful insurance)

Deepgram and Whisper API both support immediate-deletion configurations. Confirm at contract time.

---

## 4. SMS provider

### 4.1 Recommendation

**Twilio for v1.**

Estimated cost: ~$0.0079 per SMS sent in the US, plus monthly fees for phone number rental and short codes if used. For a driver receiving 2 SMS per month maximum (per nurture spec cap), that's ~$0.016/driver/month variable cost. For 1,000 active SMS-opted-in drivers, roughly $16/month variable + ~$50-200/month in number and overhead fees depending on configuration.

### 4.2 Reasoning

Three reasons:

1. **GHL integration is mature.** Your project already plans to use GoHighLevel as the workflow orchestration engine. GHL has native Twilio integration; SMS sends route through GHL's workflow triggers and Twilio is the standard backing provider. Building on Twilio means GHL handles the workflow layer and Twilio handles the carrier-level delivery.

2. **TCPA compliance tooling is mature.** Twilio provides built-in STOP/HELP handling, opt-out lists, message logging for audit purposes, and consent capture flows. For a TCPA-regulated use case (CDL driver SMS), reducing the surface area of custom-built compliance code is meaningful.

3. **Reliability and US coverage.** Twilio's deliverability in US mobile is mature, A2P 10DLC registration is well-documented, and carrier interactions (toll-free verification, short code provisioning if you need it) are streamlined.

### 4.3 The A2P 10DLC reality

CDL-A drivers receive business-to-consumer text messages from CDLA.jobs. As of 2023+, US carriers require A2P 10DLC registration for any business sending automated SMS to consumer phones. This is not optional and not Twilio-specific.

**Registration steps:**
- Brand registration with The Campaign Registry (TCR) — Twilio handles the submission
- Campaign registration (CDLA.jobs registers a "Lead Management" campaign or similar)
- Carrier review and approval — typically 1-3 weeks
- Throughput limits assigned based on trust score

**Cost:** roughly $4/month for brand + $10-50/month per campaign depending on use case classification, plus per-message fees.

**Timeline:** start the 10DLC registration **2-4 weeks before SMS launch**. Cannot be skipped.

### 4.4 Runner-up

**MessageBird (now Bird) or Sinch.**

- Both have GHL integration support
- Both are competitive on price
- Sinch is sometimes preferred for international (irrelevant for CDLA.jobs, which is US-only)
- Neither has Twilio's depth of TCPA tooling and audit logging

Why I didn't pick: Twilio's GHL integration is the smoothest path; alternatives require more glue. Not worth the engineering time for marginal cost savings.

### 4.5 What would change my mind

- **If GHL is dropped from the stack.** GHL is the workflow engine in the current spec set. If a different orchestration engine is selected, Twilio's GHL integration advantage disappears and the choice opens up.
- **If you need international SMS** (you don't, for CDL-A drivers in the US, but flagging the case).

### 4.6 What I'd avoid

- **Self-built SMS via carrier APIs** (T-Mobile, Verizon direct). Massive compliance overhead, no value for the use case.
- **Email-to-SMS gateways** (driver@carrier.txt.att.net etc.). Unreliable, deprecated, no compliance posture.

---

## 5. Calendar booking tool

### 5.1 Recommendation

**Cal.com (self-hosted or cloud) for v1, with Calendly as the fallback if you want zero-maintenance.**

Cost:
- **Cal.com cloud:** free tier covers most needs; paid tiers $15-25/user/month for team features
- **Calendly:** $10-16/user/month for the paid tier needed for embedding and CRM integrations
- **GHL built-in scheduler:** included in your GHL subscription (no additional cost)

### 5.2 Reasoning

The right answer depends on which CTAs you want to optimize for:

1. **For "Schedule a Tier 1 call" / "Talk to sales" CTAs on carrier landing pages:** the calendar tool needs to be embeddable in the page, route to a real sales calendar, and capture lead data for CRM follow-up. Cal.com and Calendly both do this well.

2. **For driver-facing CTAs (which are minimal in the spec set):** the calendar tool would only be needed if drivers schedule something with CDLA.jobs (you don't currently spec this). Skip.

3. **For internal team scheduling (QBR with Tier 1 carriers, sales follow-ups):** any of the three works.

I lean Cal.com over Calendly because:
- More flexible embed options for the carrier landing pages
- Open-source backbone (you could self-host if data residency matters later)
- Roughly equivalent feature set at a lower price point

I'd consider GHL's built-in scheduler if you want zero new vendor relationships, but the embed experience and lead-data handoff in Cal.com are smoother.

### 5.3 Runner-up

**GHL's built-in scheduler.**

- Zero additional cost
- Integrates natively with the rest of GHL
- Less polished embed UX than Cal.com or Calendly
- Calendar conflict detection less mature

Use this if you want to consolidate vendors and don't mind a less-polished booking experience for prospects.

### 5.4 What would change my mind

- **If your sales team uses Google Workspace and prefers their calendar UX**, Calendly's Google Calendar integration is slightly more mature than Cal.com's (debatable; both work well)
- **If you have an existing Calendly account** from the PHTP side that's already proven out for trucking sales, just keep using it

### 5.5 Implementation note

Whichever tool is chosen, the carrier landing pages need it embedded inline (not as a redirect to an external scheduling page). Modal-based embed > inline embed > external link, in order of preference.

Lead capture data flow:
1. Carrier books call via calendar tool
2. Calendar tool fires webhook to GHL with lead data
3. GHL routes the lead to sales + adds to nurture state appropriate to "called sales already"
4. Sales receives calendar invite + lead context in one notification

This pattern works with all three options (Cal.com, Calendly, GHL scheduler).

---

## 6. Magic-link authentication

### 6.1 Recommendation

**Stytch for v1.**

Estimated cost: free tier covers up to 25 active users/month; paid plans start at $0.05/active user/month at higher volume. For 1,000 returning drivers per month, roughly $50/month.

### 6.2 Reasoning

Three reasons:

1. **Magic-link auth is the right pattern for driver login.** Drivers shouldn't manage passwords for an occasional-use platform. Email-based magic links match how drivers will typically return to CDLA.jobs (read an email, click the link). The auth model fits the use case.

2. **Stytch is purpose-built for this.** They're the most focused vendor in the magic-link space, with proper SDK support for Next.js (which matches your stack per CLAUDE.md), session management, and the security primitives needed (token expiration, single-use links, IP/device fingerprinting available).

3. **Compliance posture.** Stytch supports SOC 2, the security event logging needed for compliance audits, and the configurable session timeouts that Attorney Brief Addendum Question 10 may require answers around. Building this yourself is doable but introduces a maintenance burden and security surface area that's hard to justify at startup scale.

### 6.3 The Attorney Brief Addendum dependency

Question 10 of the attorney brief asks specifically about magic-link auth exposure if a driver's email is compromised. The attorney's answer may require:

- Mandatory re-authentication for sensitive actions (viewing prequalification history, modifying contact info)
- Session timeout enforcement
- Suspicious-login detection and notification

All three are configurable in Stytch out of the box. Building these from scratch in a custom auth implementation is significant work.

### 6.4 Runner-up

**Magic.link (the company, separate from "magic links" as a pattern).**

- Slightly different focus (emphasis on Web3 / wallet auth) but supports traditional magic-link auth too
- Less mature for traditional email-only flows than Stytch
- Better choice if you ever need wallet-based auth (you don't, but flagging)

**Auth0:**
- More general-purpose auth platform (passwords, social login, etc.)
- Overkill for magic-link-only
- More expensive
- Use this if you ever need full SSO / enterprise IdP integration (likely not for CDLA.jobs)

### 6.5 Build-it-yourself option

You could build magic-link auth in 1-2 weeks of focused engineering: email sending (use your existing transactional email provider), token generation and storage, expiration, single-use enforcement, session cookies, basic suspicious-login detection.

Why I don't recommend this:

- It's all undifferentiated work. CDLA.jobs is not an auth product.
- Subtle security bugs (timing attacks, token replay, session fixation) are easy to ship and hard to detect.
- Maintenance over years compounds. Stytch handles all of it for you.

The build-it-yourself option only makes sense if you have a security-aware backend engineer already on the team who wants to own it long-term. Otherwise, paying ~$50/month for production-grade auth is a no-brainer.

### 6.6 What would change my mind

- **If you find an existing solid Next.js auth library** (NextAuth.js / Auth.js) that handles magic links well with the security profile you need. Auth.js is a viable option for a more DIY path with library support.
- **If session management requirements are extremely simple** (cookie-based, no advanced features), Auth.js + a custom email sender can work
- **If you have an existing Clerk/Supabase Auth/etc. relationship** from another project, lean into it

---

## 7. Decisions you didn't ask about but should make soon

A few related decisions came up in the spec work that aren't on your list of five but matter for build timing:

### 7.1 Transactional email provider

Per project memory, "Postmark/SendGrid" was the rough plan. **Recommendation: Postmark.**

- Cleaner deliverability than SendGrid for transactional sends
- Better developer experience
- Higher per-email cost but volume is low (a few thousand transactional emails per month)
- SendGrid is competitive and works fine; Postmark just has a stronger transactional reputation

For nurture-volume email, you may want to add a separate provider like Resend or SendGrid Marketing (different products, different deliverability characteristics) once nurture volume scales.

### 7.2 Resume parser

Per Conversational AI Intake Spec §7, drivers can upload resumes. Two options:

- **LLM-direct parsing:** send the resume PDF/DOCX to Claude or GPT with a structured-extraction prompt
- **Dedicated parser:** Affinda, RChilli, Sovren

**Recommendation: LLM-direct via Claude.**

- One vendor relationship
- Resume formats from CDL drivers tend to be uncomplicated (work history, dates, equipment)
- Cost is roughly $0.01 per resume parsed
- Dedicated parsers are more accurate on edge cases but the marginal value isn't worth a second vendor

### 7.3 Database hosting

Already locked: local Postgres in dev. Production needs hosted Postgres. **Recommendation: Neon or Supabase for v1.**

- Both are managed Postgres with generous free tiers
- Both work cleanly with Drizzle ORM (your existing stack)
- Neon is more "just Postgres" (less surface area, easier mental model)
- Supabase bundles auth/storage/realtime if you want it (overlaps with Stytch recommendation; pick one)
- AWS RDS or Google Cloud SQL works too if you have cloud relationships

### 7.4 Hosting

Working code is Next.js 16. **Recommendation: Vercel for v1.**

- Built for Next.js, zero-config for ISR / dynamic routes
- Generous free tier
- Easy to migrate off if needed
- Railway and Fly.io are reasonable alternatives if Vercel becomes expensive at scale

---

## 8. Total monthly cost estimate (rough)

At launch with modest volume (e.g., 100 driver intakes/week, 5 carriers in sales conversations, 200 SMS sends/month):

| Service | Estimated monthly cost |
|---------|------------------------|
| LLM (Claude API for Debbie + resume parsing) | $30-80 |
| Transcription (Deepgram) | $10-30 |
| SMS (Twilio + 10DLC fees) | $50-100 |
| Calendar (Cal.com paid) | $15-30 |
| Auth (Stytch) | $0-50 (depending on volume) |
| Email transactional (Postmark) | $10-50 |
| Database (Neon paid tier) | $20-50 |
| Hosting (Vercel paid tier) | $20-100 |
| **Total** | **~$155-490/month** |

These are rough numbers and will change with volume. The point is to give you a magnitude — early-stage CDLA.jobs runs on hundreds-per-month in external service costs, not thousands. The major cost variable as you scale is LLM token usage; if Debbie intakes grow 10x, the LLM line grows roughly 10x and starts to dominate.

---

## 9. What to do with this document

1. **Read through and disagree with whatever you disagree with.** These are my recommendations; you may have context I don't.
2. **Make the decisions you're comfortable making now**, defer the ones you're not.
3. **Get the 10DLC registration started before SMS development.** It's the longest-lead item in this list (1-3 weeks for carrier review). Pick Twilio (or alternative) and submit the brand/campaign registration as soon as possible.
4. **Add locked decisions to the Core Technical Spec v5 (when drafted)** so they're canonical for the build session prompts.
5. **Stack decisions don't need to be perfect.** All five recommendations are migrateable — none of them lock you in for years. Optimize for "start building" over "pick the perfect vendor."

---

## 10. Change log

| Date | Change | By |
|------|--------|-----|
| 2026-05-19 | v1 created — recommendations for LLM, transcription, SMS, calendar, magic-link auth, plus adjacent decisions (transactional email, resume parser, database hosting, hosting) | Todd + Claude |

---

*End of document.*
