# Attorney Brief Addendum v2 — Questions + Preliminary Implementation Answers

**Project:** CDLA.jobs  
**Prepared by:** Todd Bryson + ChatGPT  
**Date:** 2026-05-21  
**Status:** Draft for attorney review — not legal advice  
**Companion documents:** Conversational AI Intake Spec v1, Core Technical Spec v4/v5, prior attorney brief v1, Attorney Brief Addendum v1

---

## Important attorney-review note

This document consolidates the open legal/compliance questions from the prior addendum and adds preliminary implementation-oriented answers, proposed consent language, and product guardrails.

Nothing in this document should be treated as final legal advice or “approved language” until reviewed by qualified counsel familiar with TCPA, FCRA, state privacy law, employment/recruiting law, biometric/audio processing rules, and lead-generation/referral compliance.

The recommended posture throughout this document is conservative: disclose more clearly, separate higher-risk consents, log consent events, avoid hidden data flows, avoid automated rejection language, and preserve human/carrier decision-making.

---

# Executive Summary

CDLA.jobs should not rely on one vague blanket consent for all intake, communication, audio, resume parsing, matching, PHTP transfer, and carrier submission activity.

Recommended structure:

1. **Stage 1 required consent**
   - Intake data storage
   - Automated matching against carrier/job rules
   - Resume upload/parsing/storage, if applicable
   - General data processing and service-provider processing

2. **Separate optional TCPA consent**
   - Automated SMS/texts
   - Automated calls
   - Artificial/prerecorded voice
   - Must be unchecked and not required to submit intake or receive matches

3. **Separate voice/audio consent gate**
   - Triggered before microphone recording starts
   - Discloses audio capture, transmission to transcription provider, transcription, raw-audio deletion, transcript storage/use, and typed alternative

4. **Stage 2 per-carrier consent**
   - Names the selected carrier
   - Names PHTP
   - Mentions PHTP’s Tenstreet account
   - Authorizes data transfer for the specific carrier opportunity
   - Separates live-human follow-up from automated/prerecorded TCPA outreach

5. **Paid/referral placement disclosure**
   - Tier 1 paid carriers should be labeled **Sponsored Match**
   - PHTP partner/referral carriers should be labeled **Referral Partner**
   - Page-level explanation should clarify that paid/referral relationships may affect placement, timing, visibility, or routing

6. **Retention**
   - Avoid indefinite retention by default
   - Use 12-month active matching/re-consent rule
   - Retain limited audit/suppression/legal records where needed

7. **Security**
   - Magic link may create a limited session only
   - Require step-up verification for sensitive data/actions

---

# Question 1 — Stage 1 Single-Consent Scope

## Original question

Can a single consent screen, presented at the end of Stage 1 of the intake before the matching engine fires, validly authorize all of the following simultaneously:

- Storage of driver intake data by CDLA.jobs
- Automated matching against the carrier rules database
- Multichannel nurture by CDLA.jobs, including SMS, email, voice, automated systems, or prerecorded voice under TCPA prior express written consent
- Audio recording, transmission to a third-party transcription service, and processing of voice input
- Upload, automated parsing, and storage of driver-supplied resume files

If a single consent screen is acceptable, please provide approved language. If any item must be separated into its own gated consent step, please indicate which and how it should be structured.

## Preliminary answer / approach

A single screen may be used, but not a single undifferentiated checkbox.

Recommended structure:

1. **Required Stage 1 data/matching consent**
   - Storage of intake data
   - Automated matching
   - Resume upload/parsing/storage
   - General use of service providers

2. **Optional TCPA checkbox**
   - Separate, unchecked by default
   - Covers automated SMS/texts, automated calls, and prerecorded/artificial voice
   - Must state consent is not required to submit intake or receive matching

3. **Separate voice/audio gate**
   - Best presented only when the driver taps the microphone
   - Must occur before audio capture begins

Resume parsing may be included in Stage 1 if the upload feature appears during intake, but the upload UI should also include its own short disclosure near the upload field.

## Proposed Stage 1 required consent language

> **Required to continue**
>
> I authorize CDLA.jobs to collect, store, and process the information I provide during this intake, including my contact information, CDL information, endorsements, work history, equipment experience, job preferences, safety-related disclosures, application answers, uploaded resume files, and other driver-supplied documents.
>
> I understand CDLA.jobs may use this information to create or update my driver intake profile, evaluate potential job matches, automatically compare my information against carrier-provided job and qualification criteria, parse uploaded documents, generate driver profiles or summaries, and maintain records related to my job search.
>
> I understand CDLA.jobs may use trusted service providers to host, store, transmit, parse, analyze, or process this information, including cloud hosting, database, document-parsing, transcription, messaging, analytics, and AI-service providers.
>
> I understand automated matching is used to help identify potential opportunities, but final hiring decisions are made by carriers or employers, not CDLA.jobs.

Button:

> **Continue to Matching**

## Proposed optional TCPA language

> **Optional Communication Consent**
>
> I agree that CDLA.jobs may contact me at the phone number I provided about CDL job opportunities, application updates, driver recruiting, reminders, and related services by SMS/text message, phone call, and prerecorded or artificial voice message, including communications made using automated dialing or messaging technology.
>
> I understand that my consent is not required to submit my intake information, receive matching results, or pursue job opportunities. Message and data rates may apply. Message frequency may vary. I can opt out of texts by replying STOP and may revoke consent at any time by any reasonable method.

## Conditions / limits

- TCPA consent should not be prechecked.
- TCPA consent should not be required to submit intake.
- Voice/audio consent should be separately gated before recording.
- Keep versioned consent text and audit logs.

## Cross-references

- Question 2: Audio/biometric consent
- Question 3: Resume parsing
- Question 8: Re-consent cadence
- Question 11: TCPA follow-up calls

---

# Question 2 — Audio/Biometric Consent and State Law

## Original question

The intake allows drivers to respond by voice. Audio is transmitted to a third-party transcription service and processed server-side. Raw audio is discarded after transcription, but the voice itself is biometric data while in transit.

- Which state biometric privacy laws apply?
- Is privacy policy disclosure adequate, or must the consent screen call out audio processing?
- Must the transcription provider be named?
- Are state-specific written-consent requirements triggered before audio is captured?

## Preliminary answer / approach

Use a separate voice consent gate before microphone activation.

The major state laws to design around include:

- **Illinois BIPA** — high risk if a voiceprint or biometric information is created or used. Requires written notice, purpose/retention disclosure, and written release before collection.
- **Texas CUBI** — covers voiceprints and requires notice/consent before biometric capture for commercial purpose.
- **Washington biometric law** — focuses on enrollment of biometric identifiers into a database for commercial purpose.
- **Colorado biometric privacy amendments** — require biometric policies, consent, retention/deletion rules, and other safeguards.
- **California CCPA/CPRA** — treats biometric information as sensitive personal information when used for identification.
- **Other state privacy laws** — may apply depending on user residency, thresholds, sensitive-data treatment, and profiling.

Plain speech-to-text is lower risk than speaker identification or voice authentication, but the product should still disclose audio processing clearly.

## Product requirement

CDLA.jobs should not use voice input for:

- Speaker recognition
- Identity verification
- Voice authentication
- Creation of reusable voiceprints
- Voice cloning
- Model training on driver audio unless separately disclosed and consented to

## Proposed voice consent modal

> **Voice Input Consent**
>
> Before using voice input, please review and agree.
>
> By selecting **I Agree**, I authorize CDLA.jobs to capture my voice input, transmit the audio to a third-party transcription or speech-processing service provider, convert the audio into text, and process the resulting transcript as part of my driver intake and job-matching profile.
>
> I understand CDLA.jobs uses voice input only to transcribe my spoken responses and assist with completing my intake. CDLA.jobs does not use voice input for identity verification, speaker recognition, voice authentication, or creating a reusable voiceprint unless separately disclosed and agreed to.
>
> I understand that raw audio is discarded after transcription, but the transcript may be stored and used with my intake profile for job matching, recruiter review, application support, compliance, quality assurance, and related business purposes.
>
> I understand voice input is optional and that I may type my responses instead.
>
> I consent to this collection, transmission, transcription, processing, and temporary handling of my voice input.

Buttons:

> **I Agree — Use Voice Input**  
> **Type Instead**

## Provider naming

The consent modal can likely say “third-party transcription provider,” but the privacy policy or subprocessor page should name the provider once selected.

## Conditions / limits

- No microphone capture before consent.
- Typed alternative must be available.
- Raw audio should be deleted immediately after transcription or within a short defined window.
- Vendor contract should prohibit training, sale, reuse, speaker identification, and voiceprint creation unless separately approved.

## Cross-references

- Question 1: Stage 1 consent
- Question 8: Re-consent cadence
- Question 9: Retention/deletion

---

# Question 3 — Resume Parsing Disclosure

## Original question

Drivers may upload a resume. The resume is processed by an automated parser or LLM-based system which extracts work history, equipment experience, endorsements, and other fields. The driver reviews and confirms/corrects each field before matching.

- Is privacy policy disclosure sufficient?
- Does driver confirmation address automated-decision and accuracy concerns?
- Are there state-law implications?

## Preliminary answer / approach

Privacy policy disclosure alone is not enough for a clean posture. The consent screen and the upload UI should explicitly mention automated resume parsing.

The “driver confirms each extracted field” UX is a strong control because it makes the parser an assistive data-entry tool rather than a hidden decision-maker. However, it should be implemented tightly:

- No matching until the driver confirms or corrects extracted fields.
- Show raw extracted values and editable confirmed values.
- Allow manual entry instead of resume upload.
- Store raw extraction, driver-confirmed values, corrections, parser version/vendor, and timestamp.
- Use only driver-confirmed values for matching.

## Proposed resume upload disclosure

> By uploading a resume or other driver document, you authorize CDLA.jobs to process the file using automated tools, including AI-based systems or third-party resume parsing providers, to extract information such as work history, equipment experience, endorsements, license details, dates of employment, and other driver qualification information.
>
> You will have the opportunity to review, correct, and confirm extracted fields before that information is used for job matching.

## Proposed confirmation screen language

> **Review your extracted resume information before matching.**
>
> These fields were automatically extracted and may be incomplete or incorrect. Please correct anything that is wrong.
>
> CDLA.jobs will use only the information you confirm or correct for matching against job and carrier qualification rules. Final hiring decisions are made by carriers or employers.

## State-law implications

State privacy and AI laws increasingly focus on automated decision-making and profiling when systems affect employment opportunities. The risk increases if CDLA.jobs ranks, suppresses, rejects, or recommends drivers based on automated outputs.

Position the parser as:

- Data-entry assistance
- Subject to driver review/correction
- Not a final hiring decision
- Not an auto-rejection system

## Conditions / limits

- Do not auto-reject based on resume parser outputs.
- Do not transmit unconfirmed parsed data to carriers.
- Once vendor is selected, list it in privacy policy/subprocessor disclosures.

## Cross-references

- Question 1: Stage 1 consent
- Question 5: Hiring-decision posture
- Question 9: Retention/deletion

---

# Question 4 — 3-Day IntelliApp Completion Follow-Up Sequence

## Original question

When a driver consents at Stage 2 to share prequalification data with a named carrier and is deep-linked to that carrier’s IntelliApp, CDLA.jobs proposes to run a 3-day follow-up sequence by email, SMS, and voice if the driver does not complete the IntelliApp.

- Is this covered by Stage 2 consent?
- Does automated voice/prerecorded voice require supplemental TCPA consent?
- Must duration, frequency, and channels be disclosed?
- If the driver replies STOP to one channel, must all channels stop?

## Preliminary answer / approach

Stage 2 consent can cover the sequence if it clearly states:

- Which parties may contact the driver
- Which channels may be used
- The purpose is application/IntelliApp completion and recruiting follow-up
- The sequence is tied to the specific selected carrier
- Automated/prerecorded communications require separate TCPA consent

The 3-day duration and channels should be disclosed. It is not necessary to disclose every exact send time, but the consent should disclose message frequency may vary and that the follow-up window is approximately 3 days.

## Recommended structure

1. **Required Stage 2 live follow-up authorization**
   - Covers live human calls, emails, and non-automated contact about the specific carrier opportunity

2. **Optional TCPA consent**
   - Covers automated SMS/calls and artificial/prerecorded voice
   - Separate, unchecked, and not required to submit

## Proposed Stage 2 follow-up language

> I authorize CDLA.jobs to send my intake and prequalification information to PHTP through PHTP’s Tenstreet account and to **[Carrier Name]** for recruiting, prequalification, IntelliApp completion, application review, and related hiring steps.
>
> I also authorize CDLA.jobs, PHTP, and **[Carrier Name]** to contact me by live phone call, email, or other non-automated communication regarding this carrier opportunity, my application, missing information, IntelliApp completion, or next steps.

## Proposed sequence disclosure

> If I do not complete the carrier application in the initial session, CDLA.jobs, PHTP, or **[Carrier Name]** may send follow-up reminders for approximately 3 days to help me complete the application or next step.

## STOP / opt-out handling

A STOP reply should stop SMS/texts. A broader phrase such as “stop contacting me,” “remove me,” or “do not contact me” should be treated as revocation across channels where reasonably clear.

Operational rule:

- STOP = stop texts immediately.
- “Don’t call me” = stop calls.
- “Remove me” / “stop contacting me” = stop nurture across all channels.
- Sync opt-outs to PHTP/carrier where they participate in follow-up.

## Cross-references

- Question 1: TCPA consent
- Question 6: PHTP flow
- Question 11: Voice calls and TCPA

---

# Question 5 — Termination-for-Cause Expectation-Setting Language

## Original question

If a driver says they were terminated from their last trucking job for cause, Debbie may say:

> “Real talk — that's going to make it harder to find a carrier, but plenty of drivers in the same spot find work. Let me see what's out there for you.”

- Is this an adverse action under FCRA?
- Is it a hiring decision or hiring recommendation?
- Is carrier filtering based on the disclosure acceptable?
- Is there safer language?

## Preliminary answer / approach

The statement likely does not trigger FCRA adverse action by itself if based only on self-reported intake data rather than a consumer report. However, the language is too close to an employability judgment.

The safer posture is to avoid saying “harder to find a carrier,” “disqualified,” “red flag,” or “high risk.”

CDLA.jobs should frame Debbie as a matching assistant, not a hiring evaluator.

## Recommended Debbie language

> Got it. Carrier requirements vary. I’ll use this to look for jobs that may match the information you provided. You can review or correct your answers before we run the match, and the carrier makes the final hiring decision.

## If no carrier matches

> I’m not seeing a strong match based on the information currently entered. Carrier requirements vary, and this result is not a hiring decision. You can review or correct your intake details, broaden your preferences, or request recruiter review.

## Matching/filtering position

Filtering to carriers whose stated tolerances match the driver’s disclosure is generally acceptable if framed as matching, not denial. Guardrails:

- Do not call it rejection.
- Allow driver correction.
- Do not provide hire/no-hire recommendations.
- Do not assign “high-risk” labels to drivers.
- Make clear carriers make final decisions.

## Debbie system prompt rule

> Debbie must not tell a driver they are hired, rejected, disqualified, unsafe, high-risk, or ineligible. Debbie may explain that carrier requirements vary and that CDLA.jobs will look for opportunities that may fit the information provided. Debbie must state that matching results are not hiring decisions and carriers make final decisions.

## Cross-references

- Question 3: Resume parsing
- Question 8: Re-consent and stale data
- Question 9: Retention and deletion
- Question 10: Sensitive profile access

---

# Question 6 — Cross-Entity Data Flow Disclosure

## Original question

Driver data captured on CDLA.jobs is transmitted to PHTP’s Tenstreet account for any of the 20 PHTP-partnered carriers a driver pursues. PHTP holds the per-hire referral agreement; CDLA.jobs holds the driver consent relationship.

- Must Stage 2 name PHTP specifically?
- Must the privacy policy disclose the CDLA.jobs ↔ PHTP referral relationship?
- Are there state-specific disclosure requirements, including CCPA sale/share?

## Preliminary answer / approach

Yes, Stage 2 should name PHTP specifically. “Affiliated referral partner” is too vague if PHTP is the actual recipient and Tenstreet account owner.

The driver should understand:

1. CDLA.jobs collected the data.
2. PHTP receives the data.
3. PHTP’s Tenstreet account is used.
4. The selected carrier may receive/access the data.
5. PHTP has the referral relationship with the carrier.

## Proposed Stage 2 carrier submission authorization

> **Carrier Submission Authorization**
>
> You selected **[Carrier Name]** as a carrier you may want to pursue.
>
> By clicking **Submit to Carrier**, you authorize **CDLA.jobs** to send your driver intake and prequalification information to **PHTP**, CDLA.jobs’ referral partner, through **PHTP’s Tenstreet account**, so that PHTP may route or make your information available to **[Carrier Name]** for recruiting, prequalification, application review, IntelliApp completion, and related hiring steps.
>
> The information shared may include your name, contact information, CDL information, endorsements, work history, equipment experience, safety history, job preferences, resume or parsed resume data, and other information you provided during intake.
>
> CDLA.jobs is a matching and referral service. Submitting your information does not guarantee a job offer, interview, qualification, or hire. **[Carrier Name]** makes its own hiring decisions and may request additional application materials, background checks, employment verification, drug/alcohol history, MVR, PSP, DAC, or other reviews.
>
> If you do not want your information sent to PHTP and **[Carrier Name]**, do not click **Submit to Carrier**.

Button:

> **Submit My Information to PHTP and [Carrier Name]**

## Proposed privacy policy section

> **Referral Partners, Tenstreet, and Carrier Submissions**
>
> CDLA.jobs works with referral partners, including **PHTP**, to help connect drivers with participating motor carriers. When you choose to pursue a carrier opportunity, CDLA.jobs may transmit your driver intake, prequalification information, resume information, parsed resume data, contact information, CDL details, endorsements, work history, safety-related disclosures, and job preferences to PHTP, including through PHTP’s Tenstreet account.
>
> PHTP may use this information to route, submit, or make your information available to the carrier or carriers you choose to pursue. Participating carriers may use your information for recruiting, prequalification, application review, employment verification, compliance review, and hiring-related processes.
>
> CDLA.jobs and/or its referral partners may receive compensation if a driver is referred, processed, hired, or otherwise connected with a participating carrier.
>
> CDLA.jobs does not make final hiring decisions. Carriers make their own hiring decisions and may require additional information, authorizations, background checks, motor vehicle records, drug/alcohol history, employment verification, or other reviews.

## State-law issue

For CCPA/CPRA, the transfer could create “sale” risk if driver data is transferred in connection with monetary or valuable consideration. Stage 2 should be structured as a driver-directed carrier submission, but privacy choices should still surface sale/share opt-outs if applicable.

## Cross-references

- Question 7: Paid/referral placement
- Question 9: Sale/share opt-outs and deletion
- Question 11: Follow-up calls by PHTP/carrier

---

# Question 7 — Paid Placement Disclosure

## Original question

Two categories of carriers receive preferential treatment:

- Tier 1 subscription carriers paying $2,500/month receive 24-hour exclusivity and priority placement
- PHTP partner carriers appear in matches whenever preferences align, regardless of paid placement status

Must these be labeled under FTC/native advertising, endorsements, and state UDAP principles?

## Preliminary answer / approach

Yes. Both should be disclosed, but with different labels.

Tier 1 paid subscription carriers should be labeled:

> **Sponsored Match**

PHTP partner/referral carriers should be labeled:

> **Referral Partner**

The disclosure should appear:

- At top of match results page
- On affected carrier cards
- In tooltip or “Why am I seeing this?” link
- In privacy/business-model disclosures

## Proposed page-level disclosure

> **About your matches:** We show opportunities based on your intake information, preferences, and carrier criteria. Some results may be labeled **Sponsored Match** or **Referral Partner** because CDLA.jobs or its referral partners have a paid sponsorship or referral relationship with that carrier. These relationships may affect placement, timing, visibility, or routing. They do not guarantee qualification, interview, offer, or hire. Carriers make final hiring decisions.

## Proposed Tier 1 badge

Badge:

> **Sponsored Match**

Tooltip:

> This carrier has a paid sponsorship with CDLA.jobs that may affect placement, timing, or visibility.

## Proposed PHTP badge

Badge:

> **Referral Partner**

Tooltip:

> CDLA.jobs or its referral partners may receive compensation if you pursue or are hired by this carrier.

## Conditions / limits

Avoid vague labels such as:

- Featured
- Preferred
- Recommended
- Top Pick
- Best Carrier
- Verified

Those can imply quality, merit, or objective endorsement.

## Cross-references

- Question 6: PHTP data flow
- Question 9: Sale/share opt-outs
- Question 5: Avoid hiring recommendations

---

# Question 8 — Stage 1 Consent Expiration Cadence

## Original question

How frequently must Stage 1 matching consent be re-collected?

- Is annual re-consent appropriate?
- Does it vary by consent type?
- Should re-consent happen by email, in-platform screen, or both?

## Preliminary answer / approach

There is no universal rule that Stage 1 consent expires after exactly 12 months. However, annual re-consent is a strong compliance control.

Recommended rule:

> Stage 1 consent remains active for up to 12 months unless revoked or superseded. CDLA.jobs must re-collect consent before matching or automated nurture if consent is older than 12 months, if the driver’s phone number changes, if the data use or recipient list materially changes, or if the driver begins a new intake after extended inactivity.

## Cadence by category

| Consent type | Recommended cadence |
|---|---|
| Intake storage + matching | 12 months or material change |
| TCPA automated nurture | 12 months; immediately if phone/sender/purpose changes or if previously revoked |
| Voice/audio processing | Per voice session or when voice used after inactivity/material change |
| Resume parsing | Each new resume upload, plus annual if reused |
| FCRA/background reports | Separate authorization before any consumer report is obtained |
| State privacy disclosures | Current notice at each intake/reactivation; re-consent for material new uses |

## Re-consent mechanism

Use email/SMS only to bring the driver back. The actual re-consent should happen in-platform.

Flow:

1. Email/SMS invites driver to review/update profile.
2. Driver logs in or verifies identity.
3. Show profile summary.
4. Show current consent language.
5. Require separate checkboxes.
6. TCPA remains optional.
7. Store audit record.

## Re-consent triggers

Require re-consent when:

- Consent is older than 12 months
- Driver starts new job search after 90+ inactive days
- Phone/email changes
- New resume upload
- Voice intake used again after inactivity
- New referral partner or carrier data flow added
- Matching logic materially changes
- Sponsored/priority placement added
- Automated/prerecorded voice outreach added
- Driver previously revoked TCPA consent
- Privacy notice materially changes
- Driver pursues a specific carrier in Stage 2

## Cross-references

- Question 1: Stage 1 consent
- Question 2: Voice consent
- Question 9: Retention
- Question 11: TCPA

---

# Question 9 — Durable PII Storage and State Privacy Law

## Original question

Driver intake data is stored indefinitely by default to enable re-matching.

- What retention limits apply?
- What is the scope of deletion?
- What residual data may remain?
- Are opt-outs required?

## Preliminary answer / approach

Indefinite retention by default is not recommended.

Use a defined retention schedule and an inactive-profile rule.

Recommended policy:

> CDLA.jobs retains active driver intake and matching data for up to 12 months after the driver’s last consent or activity. After that, the profile becomes inactive and is not used for matching or nurture unless the driver reviews, updates, and re-consents. CDLA.jobs may retain limited records for legal compliance, fraud prevention, dispute handling, opt-out suppression, consent proof, and carrier-submission audit history.

## Suggested retention schedule

| Data category | Recommended retention |
|---|---:|
| Active intake/profile data | While account is active and consent is current |
| Stage 1 matching consent record | 4 years from last consent or matching activity |
| TCPA consent/opt-out records | 4 years minimum from last contact/revocation |
| Resume file | Delete after parsing/confirmation or retain max 12 months if user agrees |
| Parsed resume data | Same as active profile |
| Raw voice audio | Delete immediately after transcription |
| Voice transcript | Same as intake/profile |
| Matching results shown | 2–4 years depending on dispute/audit needs |
| Carrier submissions/prequalification transmissions | 4 years from submission |
| Suppression/opt-out list | As long as needed to honor opt-out |
| Fraud/security logs | 2–5 years depending on risk |
| Legal hold/dispute records | Until hold/dispute ends, then schedule resumes |

## Deletion scope

On verified deletion request, CDLA.jobs should delete or de-identify:

- Active profile
- Resume/uploaded files
- Parsed fields
- Voice transcripts
- Matching data
- Nurture data
- Non-required account data

For independent recipients like PHTP, Tenstreet, or carriers, CDLA.jobs should not promise it can delete their independent copies. It should notify/instruct processors and, where required or feasible, notify third-party recipients.

## Proposed deletion response language

> We will delete eligible personal information from CDLA.jobs systems and instruct our service providers to delete eligible information. If your information was already submitted to a carrier, referral partner, or application platform acting as an independent business or controller, we will provide available information about those recipients so you may contact them directly, and where required or feasible we will forward your request.

## Residual data CDLA.jobs may retain

Retain only limited data needed for:

- Fraud prevention
- Security monitoring
- Debugging
- Legal compliance
- Tax/accounting
- Dispute handling
- Enforcing terms
- Defending legal claims
- Honoring opt-outs/suppression
- Documenting consent history
- Proving carrier submissions

Residual records should not include full resume, full intake profile, or detailed sensitive disclosures unless legally necessary.

## Opt-out rights

If applicable, surface a **Privacy Choices** page including:

- Access
- Correction
- Deletion
- Portability
- Do Not Sell or Share My Personal Information
- Limit Use of Sensitive Personal Information, if applicable
- Opt out of targeted advertising
- Opt out of certain profiling
- Appeal request handling where required

## Cross-references

- Question 6: PHTP/Tenstreet data flow
- Question 7: Paid/referral relationships
- Question 8: Re-consent
- Question 10: Authentication

---

# Question 10 — Magic-Link Authentication Exposure

## Original question

CDLA.jobs proposes email-based magic-link authentication for returning drivers.

- If driver email is compromised, what is exposure?
- What data should/should not display without additional verification?
- Are there state-specific authentication or notification requirements?
- Recommended secondary verification?

## Preliminary answer / approach

Magic-link authentication is acceptable for low-to-moderate risk access, but should create a limited session only.

If a driver’s email account is compromised, an attacker may access the CDLA.jobs account. CDLA.jobs could face claims of inadequate access controls if sensitive data is displayed or changed without step-up verification.

## Limited magic-link session — allowed

With magic link only, allow:

- First name or masked greeting
- General job matches
- Non-sensitive job descriptions
- Generic application status
- Prompt to continue intake
- Prompt to verify phone before viewing full profile

## Require step-up verification before displaying

- Full resume
- Work history
- Termination reasons
- Accident/ticket details
- Drug/alcohol disclosures
- Criminal-history disclosures
- Prior carrier submissions
- PHTP/Tenstreet transmission history
- Uploaded documents
- Full profile export
- Contact-info edit pages

## Require step-up verification before actions

- Change email
- Change phone
- Submit to carrier/PHTP/Tenstreet
- View previous prequalifications
- Download/export data
- Delete account/data
- Grant TCPA consent
- Change opt-outs
- Upload/replace resume
- Edit sensitive safety/termination/criminal/drug disclosures

## Recommended secondary verification

Use:

- SMS OTP as default
- Authenticator app or passkey as stronger options
- Manual review for high-risk account recovery

## Product rule

> Magic-link authentication may create a limited session. A limited session may show general matches and non-sensitive account information only. Before displaying sensitive driver intake data, prior carrier submissions, resume data, safety history, termination details, drug/alcohol history, criminal-history disclosures, or before allowing carrier submission or contact-info changes, CDLA.jobs must require step-up verification using a second factor such as SMS OTP, authenticator app, or passkey.

## Session recommendations

- Magic link expires in 10–15 minutes
- One-time use only
- Rate-limited requests
- Do not reveal whether email exists
- Idle timeout: 30 minutes
- Absolute timeout: 12–24 hours
- Step-up expires after 30 minutes idle
- Sensitive action requires re-step-up after timeout

## Breach/notification

No single state rule bans magic links. However, unauthorized access to personal information may trigger breach notification duties depending on state law, data accessed, encryption/redaction, and risk of harm. CDLA.jobs should maintain an incident response plan.

## Cross-references

- Question 8: Re-consent
- Question 9: Deletion/access rights
- Question 11: Sensitive contact changes and TCPA

---

# Question 11 — TCPA Coverage of Follow-Up Sequence Channels

## Original question

The 3-day IntelliApp completion follow-up sequence includes potential voice calls.

- If calls are human-only, what consent is required?
- If calls use automated dialing or prerecorded voice, what consent is required?
- Does it depend on whether CDLA.jobs, PHTP, or carrier calls?
- Should consent anticipate both implementations?

## Preliminary answer / approach

Yes, the answer depends on both the caller and the technology.

### Human-only calls

If calls are placed by live human agents with no autodialer and no prerecorded/artificial voice, Stage 2 per-carrier consent can cover them if it names:

- CDLA.jobs
- PHTP
- The selected carrier

and states calls are about the specific carrier opportunity, IntelliApp completion, application support, missing information, or next steps.

### Automated/prerecorded calls

If calls use automated dialing technology or prerecorded/artificial voice, use a separate TCPA consent checkbox with prior express written consent language.

## Recommended Stage 2 required language

> I authorize CDLA.jobs to send my intake and prequalification information to PHTP through PHTP’s Tenstreet account and to **[Carrier Name]** for recruiting, prequalification, IntelliApp completion, application review, and related hiring steps.
>
> I also authorize CDLA.jobs, PHTP, and **[Carrier Name]** to contact me by live phone call, email, or other non-automated communication regarding this carrier opportunity, my application, missing information, or next steps.

## Recommended optional TCPA language

> **Optional:** I agree that CDLA.jobs, PHTP, and **[Carrier Name]** may contact me at the phone number I provided about this carrier opportunity, IntelliApp completion, application reminders, recruiting follow-up, and related services by call or text message, including calls or texts made using automated dialing or messaging technology and artificial or prerecorded voice messages.
>
> I understand my consent is not required to submit my information, be matched, or pursue this carrier opportunity. Message and data rates may apply. Message frequency may vary. I may revoke consent at any time, including by replying STOP to texts or by any reasonable method.

## Product rule

| Contact type | Consent needed | Covered by Stage 2? |
|---|---|---:|
| Human call from CDLA.jobs | Stage 2 application/contact authorization | Yes, if CDLA.jobs named |
| Human call from PHTP | Stage 2 application/contact authorization | Yes, if PHTP named |
| Human call from carrier | Stage 2 application/contact authorization | Yes, if carrier named |
| Automated SMS reminder | TCPA consent recommended/required depending technology/content | Only if separate TCPA checkbox covers it |
| Automated call | TCPA consent required | Only if separate TCPA checkbox covers it |
| Prerecorded/artificial voice | Prior written consent strongly required | Only if separate TCPA checkbox covers it |

## Recommendation

Build for flexibility:

1. Required Stage 2 authorization for live human follow-up.
2. Optional unchecked TCPA checkbox for automated SMS/calls and prerecorded/artificial voice.
3. Log both separately.
4. Do not use automated/prerecorded calls unless optional TCPA consent is checked.
5. Sync opt-outs among CDLA.jobs, PHTP, and carrier when they participate in the same follow-up sequence.

## Cross-references

- Question 1: Stage 1 TCPA consent
- Question 4: 3-day sequence
- Question 6: PHTP named recipient/caller

---

# Implementation Checklist

## Consent architecture

- [ ] Stage 1 required data/matching consent
- [ ] Separate optional TCPA checkbox
- [ ] Separate voice/audio gate before microphone activation
- [ ] Resume upload/parsing disclosure near upload UI
- [ ] Resume field review/correction before matching
- [ ] Stage 2 per-carrier authorization naming PHTP and carrier
- [ ] Separate Stage 2 TCPA checkbox for automated/prerecorded follow-up
- [ ] Consent versioning and audit logs

## Matching language

- [ ] Avoid “disqualified,” “rejected,” “high risk,” “unsafe,” or “ineligible”
- [ ] Use “carrier requirements vary”
- [ ] State CDLA.jobs is a matching/referral service
- [ ] State carriers make final hiring decisions
- [ ] Allow driver correction before matching

## Privacy/disclosure

- [ ] Privacy policy discloses CDLA.jobs → PHTP → Tenstreet → carrier flow
- [ ] Privacy policy discloses referral compensation
- [ ] Privacy policy discloses resume parsing
- [ ] Privacy policy discloses voice/audio processing
- [ ] Privacy policy discloses retention schedule
- [ ] Privacy Choices page includes access/correction/deletion/opt-out rights
- [ ] Sale/share analysis completed by counsel
- [ ] Subprocessor list maintained

## Paid/referral placement

- [ ] Tier 1 carriers labeled **Sponsored Match**
- [ ] PHTP carriers labeled **Referral Partner**
- [ ] Page-level match-results disclosure
- [ ] Tooltips on badges
- [ ] No vague “preferred/top pick/best” labels unless objectively supported

## Retention

- [ ] No indefinite active matching retention
- [ ] 12-month inactive profile rule
- [ ] Raw audio deleted after transcription
- [ ] Resume deletion/retention rule defined
- [ ] Consent/TCPA logs retained separately
- [ ] Deletion workflow handles processors and independent recipients

## Authentication/security

- [ ] Magic-link creates limited session only
- [ ] Step-up verification for sensitive data/actions
- [ ] SMS OTP/passkey/authenticator support
- [ ] One-time magic links expire in 10–15 minutes
- [ ] Rate limiting
- [ ] Audit logging
- [ ] Incident response plan
- [ ] Sensitive data masked by default

---

# Open Attorney Decisions Needed

Counsel should specifically confirm:

1. Whether Stage 1 + optional TCPA + separate voice gate structure is legally sufficient.
2. Exact TCPA language for CDLA.jobs, PHTP, and carriers.
3. Whether PHTP transfer constitutes a CCPA/CPRA sale or can be treated as driver-directed disclosure.
4. Whether CDLA.jobs is at risk of being characterized as a CRA under FCRA if it transmits driver summaries/prequalification data.
5. Whether any state biometric laws require jurisdiction-specific blocking or special consent.
6. Whether employment/applicant exemptions apply under specific state privacy laws.
7. Required response workflow for deletion requests affecting PHTP/carrier/Tenstreet submissions.
8. Whether paid/referral carrier labels are sufficient under FTC and state UDAP principles.
9. Whether the 12-month consent/retention cadence is acceptable.
10. Whether magic-link + SMS OTP step-up is sufficient for the sensitivity of stored driver data.

---

# Change Log

| Date | Change | By |
|---|---|---|
| 2026-05-19 | v1 questions-only draft prepared | Todd + Claude |
| 2026-05-21 | v2 added preliminary answers, proposed language, and implementation checklist | Todd + ChatGPT |

---

*End of document.*
