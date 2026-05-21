# Attorney Brief Addendum v1 — Questions for Review

**Project:** CDLA.jobs (operated by CDLA.jobs entity under referral agreement with Powerhouse Trucking Pros, LLC)
**Prepared by:** Todd Bryson
**Date:** 2026-05-19
**Status:** Draft for attorney review
**Companion documents:** Conversational AI Intake Spec v1, Core Technical Spec v4 (v5 pending), prior attorney brief v1

---

## Context for the attorney

CDLA.jobs is a two-sided CDL-A driver matching platform. Drivers complete an intake on CDLA.jobs and are matched to carriers based on stated preferences and qualifying data. The platform operates on a **prequalification submission model**: CDLA.jobs submits unsigned prequalification records to carriers, who then handle all FCRA-regulated authorizations and DOT 49 CFR 391 application requirements directly with drivers inside the carrier's own ATS (typically Tenstreet IntelliApp).

Two material changes since the original attorney brief require legal review:

1. **The primary driver intake is now a conversational AI ("Debbie") rather than a structured 6-step form.** Audio input and resume upload are supported. The intake uses a two-stage progressive disclosure model: Stage 1 collects minimum matching data with a single matching consent; Stage 2 collects per-carrier qualifying data with a per-carrier release consent, triggered only when the driver clicks into a specific match.

2. **A partner carrier job board layer has been added.** CDLA.jobs republishes job listings from approximately 20 partner carriers with whom PHTP holds existing per-hire referral agreements. Drivers who pursue these listings are deep-linked to the carrier's IntelliApp, which routes through PHTP's existing Tenstreet account. If the driver does not complete the IntelliApp within ~24 hours, a 3-day multichannel follow-up sequence (email, SMS, voice) is triggered.

Both changes introduce new regulatory surface area not covered in the original brief. The eleven questions below identify the issues requiring legal review and approval before launch. The questions are independent of one another and can be answered in any order.

---

## Questions arising from the conversational AI intake

### Question 1 — Stage 1 single-consent scope

Can a single consent screen, presented at the end of Stage 1 of the intake (before the matching engine fires), validly authorize all of the following simultaneously:

- Storage of driver intake data by CDLA.jobs
- Automated matching against the carrier rules database
- Multichannel nurture by CDLA.jobs (SMS, email, voice), including any communications placed using automated systems or prerecorded voice, under the TCPA prior express written consent standard
- Audio recording, transmission to a third-party transcription service, and processing of voice input
- Upload, automated parsing, and storage of driver-supplied resume files

If a single consent screen is acceptable, please provide approved language. If any of the above must be separated into its own gated consent step, please indicate which and how it should be structured.

Recommended structure

Use one consent screen with two or three separate actions:

Required to continue

Checkbox 1 — Data Processing / Matching / Resume / AI Parsing

This can cover:

Storage of driver intake data by CDLA.jobs
Automated matching against carrier/job rules
Resume upload, parsing, and storage
Processing of uploaded files
Use of service providers for hosting, parsing, matching, and analytics

This consent is tied to the service itself. Without it, the platform cannot match the driver.

Conditional / gated

Checkbox 2 — Voice Input / Recording / Transcription

Use this only if the user uses voice input. Best structure: when the driver taps the microphone or voice-input button, show a short consent modal first.

This is safer because call/audio recording laws vary by state. Some states require all-party consent, and when interstate communications are involved, you should design for the stricter standard. Many states allow one-party consent, but some require all parties to consent to recording.

Optional TCPA checkbox

Checkbox 3 — Automated SMS / Calls / Prerecorded Voice

This should be separate and unchecked by default.

TCPA prior express written consent requires a written agreement with a signature that clearly authorizes the seller to deliver telemarketing messages using an autodialer or artificial/prerecorded voice to the specified phone number. The written agreement must also clearly disclose that consent is not required as a condition of purchase.

Even though the FCC’s 2025 “one-to-one consent” rule was vacated, you should still identify the actual sender clearly, especially if CDLA.jobs is sending the messages.

Draft consent screen language
Header

Review and Consent

Before we match you with available CDL jobs, please review how CDLA.jobs will use your information.

Required checkbox: data storage, matching, resume parsing

Required to continue

[ ] I authorize CDLA.jobs to collect, store, and process the information I provide during this intake, including my contact information, driving history, license details, endorsements, work preferences, application answers, uploaded resume files, and any other driver-supplied documents. I understand CDLA.jobs may use this information to evaluate potential job matches, automatically compare my information against carrier and job qualification rules, parse uploaded documents, generate driver profiles or summaries, and maintain records related to my job search.

I understand CDLA.jobs may use trusted service providers to host, store, transmit, parse, analyze, or process this information, including document-parsing, transcription, cloud storage, database, messaging, analytics, and AI-service providers. I understand that automated matching is used to help identify potential opportunities, but final hiring decisions are made by carriers or employers, not solely by CDLA.jobs.

Button text after checking:

Continue to Matching

Voice input consent language

Use this when the user taps a microphone/voice feature.

Voice Input Consent

[ ] I consent to CDLA.jobs recording my voice input, transmitting the audio to a third-party transcription or speech-processing provider, converting the audio into text, and storing and processing the transcript and related data as part of my driver intake and job-matching profile. I understand I can choose not to use voice input and may type my responses instead.

Button text:

I Agree — Start Voice Input

This should be gated separately because voice recording has state-specific consent risk. Design it so voice input cannot start until this is accepted.

TCPA consent language

This should be separate, optional, unchecked, and logged.

Optional Communication Consent

[ ] I agree that CDLA.jobs may contact me at the phone number I provided about CDL job opportunities, application updates, driver recruiting, reminders, and related services by SMS/text message, phone call, and prerecorded or artificial voice message, including communications made using automated dialing or messaging technology. I understand that my consent is not required to submit my intake information or to be matched with potential jobs. Message and data rates may apply. Message frequency may vary. I can opt out of texts by replying STOP and may revoke consent at any time by any reasonable method.

Under newer FCC revocation rules, consumers may revoke TCPA consent in any reasonable manner that clearly expresses they no longer want further calls or texts; examples include STOP, QUIT, END, REVOKE, OPT-OUT, CANCEL, or UNSUBSCRIBE for texts.

Email consent

Email is different. CAN-SPAM generally does not require prior opt-in consent for commercial email, but commercial emails must comply with requirements such as truthful headers, non-deceptive subject lines, identifying the message as an ad when applicable, including a valid physical postal address, and honoring opt-outs.

You can include email in the general communication language, but still include unsubscribe functionality.

Suggested line:

By providing my email address, I agree CDLA.jobs may email me about my intake, job matches, application updates, driver recruiting, and related services. I understand I can unsubscribe from marketing emails at any time.

What must be separated?

Here is the clean answer:

Item	Can be on same screen?	Should it be separate checkbox?
Storage of intake data	Yes	Yes, required
Automated matching	Yes	Can be included with data processing
Resume upload/parsing/storage	Yes	Can be included with data processing
Voice recording/transcription	Same screen possible, but better gated at microphone use	Yes
SMS/automated calls/prerecorded voice under TCPA	Yes	Absolutely yes, separate optional unchecked checkbox
Implementation requirements

Log the consent record. Keep:

Consent text version
Timestamp
IP address
User ID/session ID
Phone number consented to
Email address
Checkbox state
Page URL/source
User agent
Whether consent was required or optional
Any later opt-out or revocation event

For TCPA, do not precheck the box. Do not make it required to submit the intake. Do not hide the automated-call/prerecorded-voice disclosure in terms. Make it clear and close to the checkbox.

My blunt recommendation: use one consent page, but make the TCPA checkbox optional and separate. Gate voice recording separately. That gives you the smooth UX you want without mixing high-risk consent into a vague all-in-one authorization.

### Question 2 — Audio/biometric consent and state law

The intake allows drivers to respond by voice. Audio is transmitted to a third-party transcription service (provider TBD) and processed server-side. Raw audio is discarded after transcription, but the voice itself is biometric data while in transit.

- Which state biometric privacy laws apply to this workflow (Illinois BIPA, Texas CUBI, Washington's biometric law, others)?
- Is disclosure in the privacy policy adequate, or must the consent screen itself call out audio processing specifically?
- Must the transcription provider be named in the consent or privacy disclosure, or is "third-party processor" sufficient?
- Are there state-specific written-consent requirements that must be met before any audio is captured (e.g., BIPA's written release requirement)?

Anser 

My recommendation

Use a separate voice consent gate before the microphone activates. Make voice optional. Do not start audio capture on page load. Do not record until consent is logged.

Also, tell your transcription provider contractually:

no voiceprint creation,
no speaker identification,
no voice authentication,
no training on user audio,
no sale/share,
delete raw audio immediately after transcription or within a defined short window,
maintain reasonable security,
process only on CDLA.jobs’ instructions,
notify you of subprocessors and incidents.
Suggested voice consent language

Use this as the separate gated modal:

Voice Input Consent

Before using voice input, please review and agree.

By selecting “I Agree,” I authorize CDLA.jobs to capture my voice input, transmit the audio to a third-party transcription service provider, convert the audio into text, and process the resulting transcript as part of my driver intake and job-matching profile.

I understand that CDLA.jobs uses voice input only to transcribe my spoken responses and assist with completing my intake. CDLA.jobs does not use voice input for identity verification, speaker recognition, voice authentication, or creating a reusable voiceprint, unless separately disclosed and agreed to.

I understand that raw audio is discarded after transcription, but the transcript may be stored and used with my intake profile for job matching, recruiter review, application support, compliance, quality assurance, and related business purposes.

I understand that voice input is optional and that I may type my responses instead.

I consent to this collection, transmission, transcription, processing, and temporary handling of my voice input.

Button:

I Agree — Use Voice Input

Alternative button:

Type Instead

Privacy policy disclosure should say

Add a separate section:

Voice Input and Transcription

If you choose to respond by voice, CDLA.jobs may temporarily capture your audio, transmit it to a third-party transcription service provider, convert it into text, and use the transcript to complete your driver intake, job-matching profile, recruiter review, and related services. Voice input is optional. You may type responses instead.

Unless separately disclosed, CDLA.jobs does not use voice input for speaker recognition, identity verification, voice authentication, or creation of reusable voiceprints. Raw audio is discarded after transcription. Transcripts may be retained as part of your intake record according to our retention policy.

We require transcription service providers to process audio only on our behalf, protect the information, avoid using it to train their models unless expressly authorized, avoid selling or sharing it, and delete audio according to our instructions.

Blunt compliance answer

Build it like this:

Separate voice consent modal: yes.
Consent before microphone starts: yes.
Provider named in modal: not required, but “third-party transcription provider” should be clear.
Provider named in privacy policy/subprocessor page: strongly recommended once selected.
Raw audio deletion: good, but still disclose.
Do not create voiceprints: make that a product requirement and vendor contract requirement.
If vendor creates speaker embeddings/voiceprints: treat it as full biometric processing and get BIPA-grade written release before capture.

For a CDL intake platform, the safest path is simple: voice-to-text only, no voice identity features, no model training, raw audio deleted immediately, separate consent gate, typed alternative always available.

### Question 3 — Resume parsing disclosure

Drivers may upload a resume during intake. The resume is processed by an automated parser (LLM-based or dedicated parser API — final selection TBD) which extracts work history, equipment experience, endorsements, and other fields. The driver is shown each extracted field and confirms or corrects before the data is used for matching.

- Is privacy policy disclosure of automated resume parsing sufficient, or must the consent screen explicitly mention resume parsing?
- Does the "driver confirms each extracted field" UX adequately address concerns about automated decision-making and data accuracy?
- Are there state law implications (e.g., automated decision-making disclosures under CCPA/CPRA) that apply?

answer 

1. Is privacy policy disclosure enough?

No — not if you want a clean compliance posture.

A privacy policy section is necessary, but the intake consent screen should also say something like:

If you upload a resume, CDLA.jobs will use automated tools, including AI or third-party parsing services, to extract information such as work history, equipment experience, endorsements, dates of employment, and other driver qualification details. You will have the opportunity to review and correct extracted fields before they are used for matching.

That should be on the consent screen or directly next to the resume upload feature.

The reason: automated resume parsing feeds into employment-opportunity matching. State privacy and AI laws increasingly focus on automated decision-making and profiling when they affect employment, housing, finance, insurance, health care, education, or similar significant opportunities. Many state privacy laws give opt-out rights for profiling based on automated decisions that produce legal or similarly significant effects, and employment opportunities are commonly treated as one of those significant areas.

2. Does driver confirmation of extracted fields help?

Yes. A lot. But it does not erase all automated-decision risk.

The “review and confirm/correct each extracted field” UX is exactly the right design choice because it addresses the two big risks:

Data accuracy — the parser may read a date, employer, endorsement, trailer type, or gap incorrectly.
Human involvement — the driver is not blindly subjected to hidden automated extraction before matching.

But you should implement it tightly:

Do not run matching until the driver confirms or corrects the extracted fields.
Show the original extracted value and the editable confirmed value.
Let the driver skip resume upload and enter details manually.
Store both:
raw extracted field,
driver-confirmed field.
Use only the driver-confirmed fields for matching.
Keep an audit trail: upload time, parser version/vendor, extracted fields, correction history, confirmation timestamp.

This gives you a strong argument that the resume parser is an assistive data-entry tool, not a final automated hiring decision system.

3. Are there state-law automated decision-making implications?

Yes, especially if the matching engine ranks, filters, rejects, suppresses, or prioritizes drivers for employment opportunities.

California CCPA/CPRA

California finalized CCPA regulations covering automated decision-making technology, risk assessments, and consumer rights to access and opt out of certain ADMT uses. The CPPA says the regulations implement consumers’ rights to access and opt out of businesses’ use of ADMT, with an effective date of January 1, 2026.

For your use case, the risk increases if CDLA.jobs uses automated tools to make or substantially facilitate “significant decisions” about employment opportunities. Even if the tool only matches drivers to carrier openings, you should design as if California may require pre-use notice, access rights, and opt-out/human review pathways.

Colorado

Colorado’s AI law focuses on high-risk AI systems and consequential decisions. The official Colorado summary says deployers must use reasonable care to protect consumers from algorithmic discrimination and, among other things, notify consumers if a high-risk AI system makes or is a substantial factor in making a consequential decision, provide an opportunity to correct incorrect personal data, and provide an appeal with human review where technically feasible.

Your “driver confirms each field before matching” UX lines up well with the correction principle, but if the matching system becomes a substantial factor in denying or ranking employment opportunities, you need more than just the confirmation screen.

Virginia / Colorado / Connecticut-style profiling laws

Several state privacy laws provide opt-out rights for profiling in furtherance of decisions that produce legal or similarly significant effects. Employment opportunity decisions are one of the major categories discussed in this area.

The practical issue is whether CDLA.jobs is merely helping drivers submit accurate information, or whether it is making/ranking/suppressing employment opportunities in a way that materially affects access to work.

Recommended UX structure

Use three layers:

A. Privacy policy

Add a full section on resume parsing and automated matching.

B. Resume upload disclosure

Put this directly near the upload box:

By uploading a resume, you authorize CDLA.jobs to process the file using automated resume parsing tools, which may include AI or third-party parsing providers, to extract work history, equipment experience, endorsements, dates of employment, and other driver qualification details. You will be able to review and correct extracted information before it is used for job matching.

C. Confirmation screen before matching

Before the matching engine fires:

Please review the information extracted from your resume. CDLA.jobs will use only the information you confirm or correct below for job matching. Automated matching may compare your confirmed information against carrier and job qualification rules. Final hiring decisions are made by carriers or employers, not solely by CDLA.jobs.

Must the parser provider be named?

For the upload disclosure, “automated resume parsing tools, including AI or third-party parsing providers” is likely sufficient at the point of upload.

But once the vendor is selected, list it in your privacy policy or subprocessor list. That is the cleaner approach.

Suggested consent language

Use this in the Stage 1 consent screen:

I understand that if I upload a resume or other driver document, CDLA.jobs may use automated tools, including AI-based systems or third-party resume parsing providers, to extract information such as work history, equipment experience, endorsements, license details, dates of employment, and other driver qualification information. I understand I will have the opportunity to review, correct, and confirm extracted fields before that information is used for job matching. I authorize CDLA.jobs to store the uploaded file, extracted data, and confirmed corrections as part of my driver intake profile.

Then, on the confirmation page:

Review your extracted resume information before matching. These fields were automatically extracted and may be incomplete or incorrect. Please correct anything that is wrong. CDLA.jobs will use only the information you confirm or correct for matching against job and carrier qualification rules. Final hiring decisions are made by carriers or employers.

Blunt recommendation

Build the resume parser like this:

Explicit disclosure at upload.
Optional upload, with manual entry alternative.
No matching until driver confirms fields.
Use confirmed data only.
Keep extraction/correction audit logs.
List parser vendor in privacy policy/subprocessor page once selected.
Add an appeal/contact pathway if a driver believes matching results are wrong.
Do not let the parser auto-reject anyone.

That setup is much safer than saying, “We disclosed it somewhere in the privacy policy.”

### Question 4 — 3-day IntelliApp completion follow-up sequence

When a driver consents at Stage 2 to share their prequalification record with a specific named carrier and is deep-linked to that carrier's IntelliApp, the IntelliApp may not be completed in the initial session. CDLA.jobs proposes to run a 3-day follow-up sequence — combination of email, SMS, and voice — encouraging the driver to complete the named carrier's IntelliApp.

- Is this follow-up sequence adequately covered by the Stage 2 per-carrier consent, or does it require its own separately-disclosed consent?
- If voice calls in the sequence use any automated dialing technology or prerecorded voice, does the existing TCPA consent language cover them, or is supplemental consent required?
- Must the consent disclose the duration (3 days), frequency, and channels of the follow-up sequence specifically?
- If the driver replies STOP to one channel, must the other channels also halt automatically?

### Question 5 — Termination-for-cause expectation-setting language

The Stage 1 intake asks whether the driver was terminated from their last trucking job. If the driver answers yes and the captured reason categorizes as cause-based (accident, safety violation, drug/alcohol policy, behavior, attendance), Debbie's response is approximately:

> "Real talk — that's going to make it harder to find a carrier, but plenty of drivers in the same spot find work. Let me see what's out there for you."

- Does this constitute an adverse action under FCRA requiring an adverse action notice?
- Does it constitute a hiring decision or hiring recommendation that could create liability for CDLA.jobs?
- Is the matching engine's subsequent filtering of carriers based on this disclosure (showing only carriers whose stated tolerances accept the driver's history) acceptable, or does it create a denial requiring notice?
- Is there language that would more clearly position Debbie as a non-decision-making matching service rather than a hiring evaluator?


ansswer

The Debbie line itself is probably not an FCRA adverse action notice trigger if it is based only on the driver’s own self-disclosed answer during intake, not a third-party consumer report. But the matching/filtering system can still create employment-screening liability if CDLA.jobs is effectively ranking, excluding, or recommending candidates for carriers.
So the safer move is: Debbie should not say anything that sounds like a hiring judgment. She should frame it as “some carriers have different qualification rules; I’ll look for carriers whose posted criteria may fit what you shared.”
1. Does Debbie’s response trigger FCRA adverse action?
Usually, no, not by itself.
FCRA adverse action duties are triggered when an adverse employment action is based in whole or in part on information in a consumer report from a consumer reporting agency. The FTC explains that before an employer takes adverse action based on a consumer report, the employer must provide a copy of the report and the FCRA Summary of Rights; after the final decision, further notice requirements apply.
Here, the data is self-reported by the driver inside CDLA.jobs intake. That is not automatically a “consumer report.”
But be careful: if CDLA.jobs becomes a platform that assembles driver profiles, scores, histories, risk labels, or recommendations and provides them to carriers for employment eligibility decisions, CDLA.jobs may start looking like a consumer reporting agency or employment-screening vendor. The CFPB has specifically warned that background dossiers and algorithmic scores used for hiring, promotion, or other employment decisions can implicate FCRA rights and obligations.
2. Does Debbie’s statement create hiring-decision liability?
The current wording is not horrible, but it is too close to an evaluative employment judgment:

“That’s going to make it harder to find a carrier…”

That sounds like CDLA.jobs is assessing employability. It may be true, but it is not the cleanest legal posture.
Better framing:


Do not say “harder to hire.”


Do not say “you may not qualify.”


Do not say “carriers won’t take you.”


Do not say “this is a red flag.”


Do not say “you failed.”


Do not assign risk categories like “high-risk driver” to the user-facing experience.


Say:

“Different carriers have different qualification rules. I’ll use what you shared to look for options whose posted requirements may be a closer fit.”

That positions Debbie as a matching assistant, not a hiring evaluator.
3. Is filtering carriers based on stated tolerances acceptable?
Generally yes, if it is eligibility matching and not a final hiring decision.
If Carrier A says “no safety termination within 12 months” and Carrier B says “review case-by-case,” it is reasonable for CDLA.jobs to avoid showing Carrier A if the driver disclosed a recent safety termination. That is arguably a better user experience because it avoids sending the driver into obvious dead ends.
But there are four big guardrails:


Do not call it a denial.
Say “we are showing opportunities that may better match the information you provided.”


Do not hide everything with no explanation.
If no matches appear, say criteria vary and invite review/update/correction.


Let the driver correct the answer.
Bad parsing or mistaken categorization should be fixable.


Make clear carriers make final decisions.
CDLA.jobs does not hire, reject, or guarantee eligibility.


This matters because the EEOC treats algorithmic tools used in hiring as selection procedures when they screen applicants, and employers can be responsible for third-party tools they use.
4. Better Debbie language
Use this instead:

“Thanks for being straight with me. Different carriers have different qualification rules, and some are more flexible than others. I’ll use what you shared to look for opportunities whose posted requirements may be a closer fit. The carrier makes the final hiring decision, and you’ll have a chance to review or correct your information before matching.”

That is much safer.
Even cleaner version

“Got it. Carrier requirements vary. I’ll use this to look for jobs that may match the information you provided. You can review or correct your answers before we run the match, and the carrier makes the final hiring decision.”

This is the version I would use in-product.
If no carrier matches
Do not say:

“You are disqualified.”

Say:

“I’m not seeing a strong match based on the information currently entered. Carrier requirements vary, and this result is not a hiring decision. You can review or correct your intake details, broaden your preferences, or request recruiter review.”

That language matters.
Recommended disclosure near the matching engine
Use this before matching:

CDLA.jobs is a matching service. We use the information you provide to compare your intake profile against carrier-provided job and qualification criteria. Matching results are informational and are not a job offer, rejection, hiring decision, or employment recommendation. Carriers and employers make their own hiring decisions and may request additional information, background checks, drug/alcohol history, safety records, employment verification, or other reviews before making any decision.

System rule for Debbie
Add this to the Debbie prompt:

Debbie must not tell a driver that they are hired, rejected, disqualified, unsafe, high-risk, or ineligible. Debbie may explain that carrier requirements vary and that CDLA.jobs will look for opportunities that may fit the driver’s provided information. Debbie must state that matching results are not a hiring decision and that carriers make final decisions.

FCRA line to draw
Your cleanest legal position is:


Driver self-discloses information.


CDLA.jobs uses it only to show potentially relevant opportunities.


Driver can review/correct before matching.


CDLA.jobs does not verify negative history unless separate authorization/compliance process exists.


CDLA.jobs does not sell “risk scores” or “hire/no-hire recommendations.”


Carrier makes the actual employment decision.


Any background check/MVR/PSP/DAC/etc. is handled through proper FCRA process by the carrier or a compliant CRA.


If CDLA.jobs starts providing carriers with scored driver reports, “risk flags,” negative history summaries, or recommendations that materially affect hiring, then you need FCRA counsel. That is the danger zone.

---

## Questions carried forward from the original attorney brief (still open)

### Question 6 — Cross-entity data flow disclosure

Driver data captured on CDLA.jobs is transmitted to PHTP's Tenstreet account for any of the 20 PHTP-partnered carriers a driver pursues. PHTP holds the per-hire referral agreement with these carriers; CDLA.jobs holds the consent relationship with the driver.

- Must the Stage 2 per-carrier consent name PHTP specifically as the recipient of the prequalification data, or is "affiliated referral partner" or similar language adequate?
- Must the CDLA.jobs privacy policy disclose the CDLA.jobs ↔ PHTP referral relationship and the resulting data flow?
- Are there state-specific disclosure requirements (CCPA "sale" or "share" definitions, etc.) that apply to this transfer?

Answer 

Because CDLA.jobs holds the consent relationship with the driver, the driver should clearly understand:

CDLA.jobs collected the intake data.
PHTP will receive the prequalification data.
PHTP may transmit/use that data through its Tenstreet account.
The selected carrier may receive or access the data.
PHTP has the referral relationship with the carrier.
1. Must Stage 2 per-carrier consent name PHTP?

Yes, I would name PHTP specifically.

Using only “affiliated referral partner” is too vague because PHTP is not just a background vendor. PHTP is part of the actual referral/data-routing chain and appears to have its own commercial role with the carriers.

Use this structure at Stage 2:

“You are choosing to pursue [Carrier Name]. To process this request, CDLA.jobs will send your prequalification information to PHTP, our referral partner, through PHTP’s Tenstreet account, and PHTP may make your information available to [Carrier Name] for recruiting and application review.”

That is much stronger than:

“We may share your info with affiliated partners.”

The FTC has taken issue with lead generation flows where consumers were told their data would go only to “trusted partners,” while the actual data sharing was broader or different than consumers reasonably expected.

2. Must the privacy policy disclose the CDLA.jobs ↔ PHTP referral relationship?

Yes. Absolutely.

The privacy policy should disclose:

categories of data collected;
purpose of sharing;
categories of recipients;
the fact that PHTP receives driver prequalification/application data;
that Tenstreet may be used as a transmission/application platform;
that selected carriers may receive or access the data;
whether CDLA.jobs receives compensation from referral outcomes;
driver rights to access, correct, delete, opt out where applicable.

For California, businesses must notify consumers at or before collection about categories of personal information collected and what the business will do with it. California also requires disclosures about categories of third parties with whom personal information is shared/disclosed, and whether information is sold or shared.

3. Is this a CCPA “sale” or “share”?

Potentially yes for “sale,” probably no for “share,” unless you use the data for cross-context behavioral advertising.

Under CCPA/CPRA:

“Share” is specifically tied to cross-context behavioral advertising. If CDLA.jobs sends data to PHTP/Tenstreet/carriers only to process a driver’s selected job opportunity, that likely is not “sharing” in the CPRA advertising sense. California’s AG says “sharing” refers to cross-context behavioral advertising.
“Sale” is broader and can include transferring personal information to a third party for monetary or other valuable consideration. If PHTP receives the data and CDLA.jobs or PHTP monetizes the referral relationship, that creates “sale” risk unless the transfer fits an exception, is structured as a consumer-directed disclosure, or PHTP is properly treated as a service provider/contractor under a compliant agreement.

The safer position is to make the Stage 2 flow a driver-directed disclosure:

“I want to pursue this carrier. Send my information to PHTP and this carrier for that purpose.”

That is cleaner than quietly selling/transferring lead data.

But do not rely on UX alone. If CCPA applies to CDLA.jobs, you still need the right privacy-policy disclosures, opt-out mechanisms if you “sell” personal information, and contracts with third parties/service providers. CCPA requires contracts for sales/disclosures to third parties, service providers, or contractors, with limited/specified purposes and privacy-protection obligations.

4. What about other states?

State privacy laws are now broad and messy. Texas, for example, applies to businesses that conduct business in Texas or offer products/services consumed by Texas residents and process personal data, with small-business limitations and a special rule requiring consent before selling sensitive data.

Many state privacy laws include rights around:

access;
correction;
deletion;
opt-out of sale;
opt-out of targeted advertising;
opt-out of certain profiling;
sensitive-data consent or limitations.

Whether each law applies depends on thresholds, state residency, revenue/data volume, and whether employment/applicant data is exempt in that state. Do not assume California is the only issue.

Recommended Stage 2 consent language

Use this when the driver selects a specific carrier:

Carrier Submission Authorization

You selected [Carrier Name] as a carrier you may want to pursue.

By clicking Submit to Carrier, you authorize CDLA.jobs to send your driver intake and prequalification information to PHTP, CDLA.jobs’ referral partner, through PHTP’s Tenstreet account, so that PHTP may route or make your information available to [Carrier Name] for recruiting, prequalification, application review, and related hiring steps.

The information shared may include your name, contact information, CDL information, endorsements, work history, equipment experience, safety history, job preferences, resume or parsed resume data, and other information you provided during intake.

CDLA.jobs is a matching and referral service. Submitting your information does not guarantee a job offer, interview, qualification, or hire. [Carrier Name] makes its own hiring decisions and may request additional application materials, background checks, employment verification, drug/alcohol history, MVR, PSP, DAC, or other reviews.

If you do not want your information sent to PHTP and [Carrier Name], do not click Submit to Carrier.

Button:

Submit My Information to PHTP and [Carrier Name]

Privacy policy language

Add a section like this:

Referral Partners, Tenstreet, and Carrier Submissions

CDLA.jobs works with referral partners, including PHTP, to help connect drivers with participating motor carriers. When you choose to pursue a carrier opportunity, CDLA.jobs may transmit your driver intake, prequalification information, resume information, parsed resume data, contact information, CDL details, endorsements, work history, safety-related disclosures, and job preferences to PHTP, including through PHTP’s Tenstreet account.

PHTP may use this information to route, submit, or make your information available to the carrier or carriers you choose to pursue. Participating carriers may use your information for recruiting, prequalification, application review, employment verification, compliance review, and hiring-related processes.

CDLA.jobs and/or its referral partners may receive compensation if a driver is referred, processed, hired, or otherwise connected with a participating carrier.

CDLA.jobs does not make final hiring decisions. Carriers make their own hiring decisions and may require additional information, authorizations, background checks, motor vehicle records, drug/alcohol history, employment verification, or other reviews.

My blunt recommendation

Do it this way:

Stage 1: general CDLA.jobs intake consent.
Stage 2: per-carrier submission authorization.
Name PHTP.
Name the selected carrier.
Mention Tenstreet as the transmission/application platform.
Log consent per carrier.
Do not use vague “partners” language for the actual data handoff.
Update privacy policy with the CDLA.jobs → PHTP → Tenstreet → carrier flow.
Have a written data-sharing/referral agreement with PHTP.

For lead-gen style businesses, the worst place to be is vague data sharing. The FTC has specifically warned that when the “product” is personal data, businesses need to vet recipients and understand how the information is used.

### Question 7 — Paid placement disclosure

Two categories of carriers receive preferential treatment in the driver-facing match display:

- Tier 1 subscription carriers ($2,500/month flat) receive a 24-hour exclusivity window and priority placement
- PHTP partner carriers (the 20) appear in matches whenever a driver's preferences align, regardless of paid placement status

- Under FTC guidance on native advertising and endorsements, and under state UDAP statutes, must the driver-facing match display label these carriers as "Featured Partner," "Sponsored," or similar?
- What specific disclosure language is sufficient?
- Does the answer differ for the two categories (Tier 1 paid subscription vs. PHTP per-hire referral)?

Answer
The FTC’s native advertising guidance is built around a simple rule: if the format could mislead people about the commercial nature/source of content, use a clear and conspicuous disclosure. The FTC also says disclosures should be close to the claim/content they qualify and understandable to ordinary consumers.

The blunt answer
Tier 1 subscription carriers

These should be labeled.

They pay $2,500/month and receive:

24-hour exclusivity window
priority placement

That is clearly paid preferential treatment. Calling them just a “match” without disclosure creates deception risk because the driver may assume the top result is objectively the best fit.

Use:

Sponsored Match

or

Featured Sponsor

or

Paid Partner

My favorite is Sponsored Match because it is short and clear.

PHTP partner carriers

These should also be disclosed, but differently.

If they are appearing because of a referral relationship/per-hire economics, even if they do not pay for priority placement directly, the platform still has a material business relationship that could affect what the driver sees.

Use:

Referral Partner

or

Partner Carrier

or

PHTP Referral Partner

My favorite is Referral Partner because it is clearer than “partner,” which can sound vague.

Does the answer differ between the two?

Yes.

Carrier type	What is happening	Recommended label
Tier 1 subscription carrier	Pays flat monthly fee for priority/exclusivity	Sponsored Match
PHTP partner carrier	Appears because of referral relationship/per-hire pathway	Referral Partner
Carrier ranked only by fit, no payment/referral influence	Organic match	Best Match / Standard Match / no paid label

Do not use the same label for both unless you explain it. A flat paid placement and a referral relationship are not the same thing.

Specific disclosure language

At the top of the match results page, use this:

How matches are shown: CDLA.jobs shows jobs based on the information you provided and carrier criteria. Some carriers may receive higher placement, early visibility, or referral routing because they are paid sponsors or referral partners. Sponsored or partner status does not guarantee that the job is the best fit, that you qualify, or that you will be hired. Carriers make their own hiring decisions.

Then on each result card:

For Tier 1 subscription carriers

Badge:

Sponsored Match

Tooltip or small text:

This carrier receives priority placement or early visibility because of a paid relationship with CDLA.jobs.

For PHTP partner carriers

Badge:

Referral Partner

Tooltip or small text:

This carrier may be shown or routed through a CDLA.jobs referral partner relationship. CDLA.jobs or its partners may receive compensation if you pursue or are hired by this carrier.

For both, if you want one combined label

Badge:

Partner Match

Tooltip:

This carrier has a paid sponsorship or referral relationship with CDLA.jobs or its referral partners. This may affect placement, timing, or routing in your match results.

That is acceptable, but less precise. I would separate the labels.

Where the disclosure should appear

Do not hide this only in the privacy policy or terms. Put it:

On the match results page near the top.
On each affected carrier card with a badge.
In a tooltip or “Why am I seeing this?” link.
In the privacy policy/business model disclosure.

The FTC’s digital disclosure guidance emphasizes placement, proximity, prominence, and whether consumers are likely to notice the disclosure. If you need a disclosure to prevent deception and you cannot make it clear and conspicuous, the FTC’s position is that the ad/claim should be changed or not used.

What not to use

Avoid vague labels like:

“Featured”
“Recommended”
“Top Pick”
“Preferred”
“Popular”
“Best Carrier”
“Verified”
“Partner”

Those can imply quality, merit, or objective recommendation. If payment affects placement, say Sponsored. If referral economics affect routing, say Referral Partner.

Best-practice match card layout

Example:

ABC Trucking
Sponsored Match
Local CDL-A | Home daily | $1,650 weekly average

Small text:

Paid sponsorship may affect placement. Carrier makes final hiring decision.

For a PHTP carrier:

XYZ Logistics
Referral Partner
Regional CDL-A | Reefer | $1,800 weekly average

Small text:

CDLA.jobs or its referral partners may receive compensation if you pursue or are hired by this carrier.

State UDAP risk

State UDAP laws generally prohibit unfair or deceptive acts or practices, and many state AGs look to FTC principles. If drivers reasonably believe the match order is neutral and merit-based, but placement is influenced by paid sponsorship or referral compensation, that is exactly the kind of thing you should disclose clearly.

My recommendation: design as if a regulator asks, “Would a reasonable driver understand why this carrier is being shown first?” If the answer is no, your disclosure is weak.

Final recommended disclosure package

Use this exact structure:

Page-level disclosure

About your matches: We show opportunities based on your intake information, preferences, and carrier criteria. Some results may be labeled Sponsored Match or Referral Partner because CDLA.jobs or its referral partners have a paid sponsorship or referral relationship with that carrier. These relationships may affect placement, timing, visibility, or routing. They do not guarantee qualification, interview, offer, or hire. Carriers make final hiring decisions.

Tier 1 badge

Sponsored Match

Tooltip:

This carrier has a paid sponsorship with CDLA.jobs that may affect placement, timing, or visibility.

PHTP badge

Referral Partner

Tooltip:

CDLA.jobs or its referral partners may receive compensation if you pursue or are hired by this carrier.

### Question 8 — Stage 1 consent expiration cadence

How frequently must Stage 1 matching consent be re-collected from a driver to remain valid?

- Is annual (12-month) re-consent the appropriate cadence?
- Does the answer vary by what the consent covers (TCPA prior express written consent for nurture vs. FCRA-adjacent prequalification authorization vs. state privacy disclosures)?
- What is the mechanism for re-collecting consent — email re-confirmation, in-platform re-consent screen, or both?

answer

Re-collect Stage 1 consent every 12 months, and sooner if the consent text, data use, carrier/referral partner flow, phone number, or communication purpose materially changes.

There is no universal federal rule that says “Stage 1 matching consent expires after exactly 12 months.” The 12-month cadence is a risk-control policy, not a magic legal deadline.

Short answer
Consent type	Does it legally expire after 12 months?	Recommended CDLA.jobs cadence
Basic intake storage + matching consent	Usually no fixed expiration	Re-consent every 12 months or upon material change
TCPA automated SMS/calls/prerecorded voice	No simple 12-month expiration rule, but revocation must be honored	Re-consent every 12 months, and whenever phone number/purpose/sender changes
Voice/audio processing consent	No universal cadence, but biometric/recording risk is higher	Re-consent per session or at least whenever voice is used after inactivity/material changes
Resume parsing consent	No fixed expiration	Re-consent when uploading a new resume or annually if reused
FCRA-style/background authorization	If actual consumer reports are involved, separate FCRA authorization is needed before report procurement	Do not rely on old Stage 1 consent for actual background/MVR/PSP/DAC pulls
State privacy notice/CCPA-style disclosure	Notice required at or before collection; material new use requires new notice/consent	Present current notice at each new intake or reactivation
1. Is annual 12-month re-consent appropriate?

Yes. Annual re-consent is a good default.

But do not think of it as “legally valid for exactly 12 months.” Think of it as an internal compliance control.

Use a 12-month expiration for the Stage 1 matching consent because driver information gets stale fast:

phone number may change;
employment status changes;
tickets/accidents change;
drug/alcohol history changes;
carrier qualification rules change;
referral partner/carrier relationships change;
TCPA risk increases with stale numbers;
privacy disclosures may change.

So in product terms:

If Stage 1 consent is older than 12 months, require the driver to review/update intake data and re-consent before matching or automated nurture continues.

That is a strong business rule.

2. Does the cadence vary by consent category?

Yes.

A. TCPA nurture consent

For TCPA, the biggest issue is not expiration. It is whether you can prove the driver gave prior express written consent for the specific seller/caller, message type, phone number, and automated/prerecorded technology, and whether the driver later revoked it.

The FCC’s newer revocation rules require companies to honor revocation requests within a reasonable time not to exceed 10 business days, and consumers may revoke consent through reasonable methods.

Recommended rule:

Re-consent every 12 months for automated SMS/voice nurture.
Re-consent immediately if:
phone number changes;
sender changes;
you add prerecorded/artificial voice;
you add new categories of messages;
you add PHTP/carrier-specific outreach not previously disclosed;
driver previously opted out.

Also: never override an opt-out with annual re-consent emails/texts. If they opted out of texts, do not text them asking them to opt back in.

B. FCRA-adjacent prequalification

Stage 1 matching based on self-reported data is not the same as pulling a consumer report. But if CDLA.jobs or a carrier pulls MVR, PSP, DAC, criminal background, employment verification through a CRA, or other consumer-report data, that needs a separate FCRA-compliant disclosure and authorization before the report is obtained.

The FTC says employers must provide the required disclosure and get authorization before obtaining a background screening report.

Recommended rule:

Stage 1 consent can cover self-reported prequalification and matching.
It should not be treated as evergreen permission to pull background reports.
Before any actual consumer report/background report is ordered, collect a separate FCRA authorization in the proper standalone format.
C. State privacy disclosures

State privacy laws are more about notice at or before collection, data-use transparency, and rights such as access, deletion, correction, opt-out, and limits on certain profiling/sale/sharing.

California requires notice at or before collection describing categories of personal information and uses. If you use previously collected personal information for a materially different purpose than disclosed, California regulations require direct notice and explicit consent for the new use.

Recommended rule:

Present the current privacy disclosure/consent every time a driver starts a new intake.
Require re-consent if you materially change:
recipients;
matching logic;
paid/referral routing;
automated decision-making;
resume parsing;
voice processing;
TCPA messaging;
sale/share practices.
3. What mechanism should be used to re-collect consent?

Use in-platform re-consent as the source of truth. Email can drive the driver back to the platform, but do not rely on a passive email as consent.

Best mechanism
Email or SMS says:
“Please review and update your driver profile before we continue matching you.”
Link opens CDLA.jobs.
Driver logs in or verifies identity.
Show current data summary.
Show current consent language.
Driver checks required boxes.
TCPA checkbox remains separate and optional.
Driver clicks a clear button:
“Confirm My Information and Continue Matching”
Store full consent audit record.
Why not email-only?

Because email re-confirmation is weaker. You want proof of:

exact consent language shown;
timestamp;
IP address;
user ID/session;
phone number/email;
checkbox states;
version of privacy policy;
TCPA consent separately;
device/browser metadata;
source page;
carrier/referral partner disclosures shown.

An email click alone is usually not enough for clean TCPA prior express written consent, especially if it does not show the full required disclosures next to an unchecked box.

4. Recommended re-consent triggers

Require Stage 1 re-consent when any of these occur:

Consent is older than 12 months.
Driver starts a new job search after 90+ days inactive.
Driver changes phone number.
Driver changes email.
Driver uploads a new resume.
Driver uses voice intake again after a prior session.
CDLA.jobs adds a new referral partner like PHTP.
Data begins flowing to a new system/vendor.
CDLA.jobs changes matching criteria in a material way.
CDLA.jobs adds sponsored/priority placement.
CDLA.jobs adds automated/prerecorded voice outreach.
Driver previously revoked TCPA consent.
Privacy policy/notice changes materially.
Driver pursues a specific carrier in Stage 2.
5. Recommended product rule

Use this internally:

Stage 1 consent remains active for up to 12 months unless revoked or superseded. CDLA.jobs must re-collect consent before matching or automated nurture if consent is older than 12 months, if the driver’s phone number changes, if the data use or recipient list materially changes, or if the driver begins a new intake after extended inactivity. TCPA consent must be tracked separately and may be revoked at any time.

6. Consent record fields to store

Log:

driver ID;
consent version;
exact consent text;
timestamp;
IP address;
user agent;
email;
phone number;
TCPA checkbox status;
voice consent status;
resume parsing consent status;
privacy policy version;
PHTP/referral disclosure version;
whether consent was Stage 1 or Stage 2;
source URL;
opt-out/revocation history.
Bottom line

Annual re-consent is the right default, but the better rule is:

Re-consent every 12 months or sooner when anything material changes.

Use email/SMS only to bring the driver back. The actual consent should be collected through an in-platform screen with versioned language, separate checkboxes, and an auditable acceptance event.

### Question 9 — Durable PII storage and state privacy law

Driver intake data is stored in CDLA.jobs's database indefinitely by default to enable re-matching as new carriers join.

- What retention limits, if any, apply under CCPA, VCDPA, CPA, and other state consumer privacy laws?
- What is the scope of a driver's right to deletion — does it extend to records of carriers the driver has previously been matched to or submitted prequalifications to?
- What residual data may CDLA.jobs retain after a deletion request (e.g., for fraud prevention, legal hold, dispute records)?
- Are there state-specific opt-out rights (e.g., CCPA "sale" or "share" opt-outs) that must be surfaced in the driver experience?

Answer 

1. Do CCPA, VCDPA, CPA, and other state laws allow indefinite retention?

Usually, no, not safely.

California CCPA/CPRA

California requires notice at or before collection, including the categories of personal information collected, purposes of use, whether each category is sold/shared, and the length of time each category will be retained or the criteria used to determine the retention period.

California also gives consumers rights to know, delete, correct, opt out of sale/share, limit sensitive personal information use, and non-discrimination.

So “we keep everything forever in case future carriers join” is weak. You need a disclosed retention schedule tied to purpose.

Virginia VCDPA

Virginia gives consumers rights to access, correct, delete, portable copy, and opt out of targeted advertising, sale, or profiling that produces legal or similarly significant effects.

Virginia also requires controllers to limit personal data collection to what is adequate, relevant, and reasonably necessary for disclosed purposes.

Important: Virginia’s consumer law generally applies to individuals acting in a personal/household context, not commercial or employment contexts. But do not rely on that exemption as your whole strategy. CDLA.jobs is a recruiting marketplace handling sensitive job-opportunity data, so build the rights workflow anyway.

Colorado CPA

Colorado’s CPA grants access, deletion, correction, portability, and opt-out rights for sale, targeted advertising, and certain profiling.

Colorado’s AG also says the CPA does not cover personal data of individuals acting as job applicants, but the law still shows the broader privacy expectation: data should be minimized and not kept longer than necessary. Colorado rules also require controllers to set specific erasure time limits or conduct periodic review so personal data is not kept longer than necessary.

2. Recommended CDLA.jobs retention schedule

I would use this:

Data category	Recommended retention
Active intake/profile data	While account is active + current consent is valid
Stage 1 matching consent record	4 years from last consent or last matching activity
TCPA consent/opt-out records	4 years minimum from last contact or revocation
Resume file	Delete after parsing/confirmation or retain max 12 months if user agrees
Parsed resume data	Same as active profile data
Voice raw audio	Delete immediately after transcription
Voice transcript	Same as intake/profile data
Matching results shown to driver	2–4 years, depending on dispute/audit needs
Carrier submissions/prequalification transmissions	4 years from submission
Suppression/opt-out list	Indefinite or as long as needed to honor opt-out
Fraud/security logs	2–5 years depending on risk
Legal hold/dispute records	Until hold/dispute ends, then retention schedule resumes

For active re-matching, use this rule:

Driver profiles become inactive after 12 months without re-consent or account activity. Inactive profiles are excluded from matching and nurture until the driver reviews, updates, and re-consents.

That is much better than “stored indefinitely.”

3. Does deletion extend to carriers already matched or submitted to?

For CDLA.jobs’ own database: yes, subject to exceptions. If the driver submits a verified deletion request, CDLA.jobs should delete or de-identify the driver’s active profile, resume, parsed fields, matching data, and nurture data unless a legal/business exception applies.

For service providers/processors: CDLA.jobs should instruct them to delete too. California says consumers can request deletion and businesses must tell service providers to do the same, subject to exceptions.

For independent recipients like carriers/PHTP: this is more complicated. If CDLA.jobs already transmitted the driver’s prequalification to PHTP, Tenstreet, or a carrier, those parties may be independent controllers/businesses for their copy. CDLA.jobs should:

delete its own copy where required;
notify/instruct service providers/processors;
notify third-party recipients where legally required or contractually possible;
tell the driver that carrier/PHTP copies may need to be requested from those parties directly if they are independent controllers.

Do not promise: “We will delete your data from every carrier system.” You probably cannot guarantee that.

Better language:

We will delete eligible personal information from CDLA.jobs systems and instruct our service providers to delete eligible information. If your information was already submitted to a carrier, referral partner, or application platform acting as an independent business or controller, we will provide available information about those recipients so you may contact them directly, and where required or feasible we will forward your request.

4. What residual data may CDLA.jobs retain after deletion?

You can usually retain limited data if needed for:

fraud prevention;
security monitoring;
debugging;
legal compliance;
tax/accounting;
dispute handling;
enforcing terms;
defending legal claims;
honoring opt-outs/suppression;
documenting consent history;
proving when/where data was submitted;
preventing duplicate or unauthorized use.

California’s CPPA FAQ lists common deletion-denial reasons, including inability to verify identity, legal exceptions, security practices, completing a transaction/requested service, internal uses compatible with expectations, legal obligations, and exercising or defending legal claims.

The retained residual record should be minimal. For example:

driver ID or hashed identifier;
name/email/phone only if needed;
deletion request timestamp;
consent version history;
opt-out status;
carrier submission audit log;
legal hold flag;
reason for retention;
deletion completion date.

Do not keep the full resume, full intake history, safety details, or termination explanation “just in case.”

5. State-specific opt-out rights that should be surfaced

Yes. Build a visible Privacy Choices page.

At minimum, include:

California

Surface:

Request to know/access
Request to delete
Request to correct
Do Not Sell or Share My Personal Information
Limit Use of Sensitive Personal Information, if applicable
Global Privacy Control / opt-out preference signal support if subject to CCPA

California says businesses must honor opt-out of sale/share and in most cases provide a clear link such as “Do Not Sell or Share My Personal Information,” “Your Privacy Choices,” or “Your California Privacy Choices.”

Virginia

Surface:

Access
Correct
Delete
Portability
Opt out of sale
Opt out of targeted advertising
Opt out of profiling in furtherance of decisions producing legal or similarly significant effects

Virginia’s statute expressly includes opt-out rights for targeted advertising, sale, and profiling tied to significant decisions.

Colorado

Surface:

Access
Correct
Delete
Portability
Opt out of sale
Opt out of targeted advertising
Opt out of certain profiling
Universal opt-out mechanism recognition if applicable

Colorado requires clear disclosure when personal data is sold or processed for targeted advertising and explains that consumers can opt out through privacy notices and a readily accessible location outside the notice.

6. What about “sale” or “share” for CDLA.jobs?

This is the big danger zone.

If CDLA.jobs transfers driver data to PHTP or carriers and receives compensation per hire, referral, submission, or lead, California could view that as a sale risk because “sale” can include disclosure for monetary or other valuable consideration.

You can reduce risk by making Stage 2 a driver-directed carrier submission, not a hidden lead sale:

“I authorize CDLA.jobs to send my information to PHTP and [Carrier Name] for this opportunity.”

But if CDLA.jobs is subject to CCPA, I would still surface a Do Not Sell or Share / Privacy Choices mechanism and disclose the referral economics clearly.

For “share,” California mainly uses that term for cross-context behavioral advertising, so carrier submissions are more likely a “sale” question than a “share” question unless ad tracking/retargeting is involved.

7. Recommended deletion workflow

When a driver requests deletion:

Verify identity.
Stop nurture and matching immediately.
Remove from active matching indexes.
Delete/de-identify profile, resume, parsed fields, transcripts, and uploaded files.
Retain only minimal suppression/audit/legal records.
Notify processors/service providers.
Notify PHTP/carriers where required, feasible, or contractually agreed.
Send driver a completion response explaining what was deleted and what was retained.
Provide appeal/contact pathway if request is denied or partially denied.

California, Virginia, and Colorado generally use a 45-day response window, with possible extension under conditions.

Bottom line

Do not keep driver data indefinitely by default.

Use this policy instead:

CDLA.jobs retains active driver intake and matching data for up to 12 months after the driver’s last consent or activity. After that, the profile becomes inactive and is not used for matching or nurture unless the driver re-consents. CDLA.jobs may retain limited records for legal compliance, fraud prevention, dispute handling, opt-out suppression, consent proof, and carrier-submission audit history. Drivers may request access, correction, deletion, and applicable opt-outs through a Privacy Choices page.

### Question 10 — Magic-link authentication exposure

CDLA.jobs proposes to use email-based magic-link authentication for returning drivers (no password; driver enters email and receives a one-time login link).

- If a driver's email account is compromised, what is CDLA.jobs's exposure for unauthorized access to that driver's account?
- What data should and should not be displayed in a magic-link-authenticated session without additional verification?
- Are there state-specific authentication or notification requirements that apply?
- Is there a recommended secondary verification step for sensitive actions (e.g., viewing prior prequalifications submitted, modifying contact information)?

Answer

The blunt answer: do not let a magic link alone unlock the full driver history. It is convenient, but if the email account is compromised, the attacker owns the session.

1. If the driver’s email is compromised, what is CDLA.jobs’ exposure?

If CDLA.jobs uses email-only magic links and an attacker accesses the driver’s email, CDLA.jobs could face claims that it failed to use reasonable access controls for sensitive personal data.

That does not mean CDLA.jobs is automatically liable every time a driver’s Gmail gets hacked. But the platform is storing sensitive employment-related intake data: work history, safety disclosures, terminations, endorsements, phone number, resume data, carrier submissions, possibly drug/alcohol or background-related disclosures. That raises the expected security standard.

The FTC’s business guidance says companies should protect personal information through reasonable security, control access sensibly, and understand what data they collect, store, and transmit. NIST identity guidance also treats reauthentication and assurance level as risk-based; for stronger authentication sessions, NIST describes shorter timeouts and reauthentication expectations.

So your risk is not “magic links are illegal.” The risk is using email-only login for high-impact actions without step-up verification.

2. What should be visible after magic-link login only?

Use a limited-access session after email magic link.

Okay to display with magic link only
First name or masked profile greeting
Current general job preferences
Non-sensitive match list
General job descriptions
High-level application status
“You have previous submissions” without details
Prompt to continue intake
Prompt to complete secondary verification

Example:

Welcome back, Todd. We found new CDL-A matches near Olathe, KS. Verify your phone number to view or update your saved driver profile.

Do not display without step-up verification
Full date of birth, if collected
Full phone number or email editing page
Full resume file
Full work history
Termination reasons
Accident/ticket details
Drug/alcohol policy disclosures
Criminal history disclosures
Prior carrier submission details
PHTP/Tenstreet transmission history
Documents uploaded
Any full profile export
Any page that shows sensitive “why matched/why not matched” logic
Do not allow without step-up verification
Changing email
Changing phone number
Submitting to a carrier
Viewing previous prequalifications submitted
Downloading/exporting profile data
Deleting account/data
Granting TCPA consent
Changing opt-out preferences
Uploading/replacing resume
Editing safety, termination, criminal, or drug/alcohol-related disclosures
3. Are there state-specific authentication or notification requirements?

There is no single state rule that says “magic links require SMS verification.” But state privacy and data-breach laws create pressure to use reasonable safeguards and notify users if personal information is accessed by an unauthorized party.

All 50 states have breach notification laws requiring notice for certain compromised personal information. Many states include online-account credentials within breach-notification definitions, and some also address security credentials or access codes.

For CDLA.jobs, the bigger issue is not just breach of credentials. It is unauthorized access to employment-related personal data. If an attacker uses a compromised email account to log in and view or modify sensitive driver information, CDLA.jobs may need to assess breach-notification obligations depending on the state, data accessed, whether the data was encrypted/redacted, and whether the incident creates a risk of harm.

You also need a written incident-response process. The FTC recommends having a data-breach response plan and taking immediate action to secure systems, fix vulnerabilities, and determine what happened.

4. Recommended secondary verification

Use email magic link + SMS OTP as the default step-up for sensitive actions.

Why? CDLA.jobs already collects driver phone numbers for recruiting. Phone verification is familiar, low-friction, and much better than email-only.

For higher-risk cases, add additional checks:

Confirm last 4 digits of phone number before sending OTP
Device/IP risk check
Reauthentication if session is old or inactive
Email alert after sensitive changes
Delay or freeze after email/phone changes
Manual support review for account recovery
Recommended authentication model
Level 1: Magic-link session

Allowed:

View non-sensitive job matches
Continue general intake
View generic account dashboard
See masked profile details

Session rules:

Magic link expires in 10–15 minutes
One-time use only
Bind to same browser/device when practical
Short session lifetime
Log IP/device/user agent
Notify user of new login
Level 2: Step-up verified session

Require SMS OTP, authenticator app, or verified passkey before:

Viewing full driver profile
Viewing past submissions/prequalifications
Submitting to PHTP/carrier
Editing phone/email
Editing sensitive driver disclosures
Downloading/deleting data
Re-consenting to TCPA
Updating resume
Level 3: High-risk recovery/manual review

Require support/manual review when:

Email and phone are both changed
Phone number cannot receive OTP
Login from suspicious IP/device
Account has prior fraud/security flags
Driver requests full data export after suspicious login
User tries to change identity-linked fields
Product rule I would give your developer

Magic-link authentication may create a limited session. A limited session may show general matches and non-sensitive account information only. Before displaying sensitive driver intake data, prior carrier submissions, resume data, safety history, termination details, drug/alcohol history, criminal-history disclosures, or before allowing carrier submission or contact-info changes, CDLA.jobs must require step-up verification using a second factor such as SMS OTP, authenticator app, or passkey.

Sensitive action matrix
Action	Magic link only?	Step-up required?
View general matches	Yes	No
View full profile	No	Yes
View prior carrier submissions	No	Yes
Edit job preferences	Maybe	Prefer step-up
Edit safety/termination/drug/criminal disclosures	No	Yes
Change phone number	No	Yes
Change email	No	Yes
Submit to carrier/PHTP/Tenstreet	No	Yes
Upload resume	No	Yes
Delete account/data	No	Yes
Download data/export	No	Yes
Re-authorize TCPA consent	No	Yes
Session timeout recommendation

Use NIST-style risk-based session rules.

For normal magic-link sessions:

Magic link expires after 10–15 minutes
One-time link only
Session idle timeout: 30 minutes
Absolute session timeout: 12–24 hours

For step-up verified sessions, NIST’s current guidance for AAL2 says overall timeout should be no more than 24 hours and inactivity timeout should be no more than 1 hour. Older NIST 800-63-3 guidance was stricter at 12 hours overall and 30 minutes inactivity for AAL2.

For your platform, I would use the stricter version for sensitive data:

Step-up expires after 30 minutes idle
Require re-step-up for sensitive actions after 30 minutes
Require full reauthentication after 12 hours
Extra security controls

Implement these from day one:

Rate-limit magic-link requests
Do not reveal whether an email exists
One-time-use links
Short expiration
Store hashed tokens only
Require HTTPS
Mark sessions secure, HttpOnly, SameSite
Device/IP anomaly detection
Login notification email
Sensitive-action notification
Audit log for profile access and changes
Account lock or cooldown after repeated attempts
Mask sensitive fields by default
Admin access logging
Encryption at rest and in transit
Bottom line

Use magic links, but only as the front door.

The safe design is:

Magic link = low-risk access.
Phone/passkey/authenticator step-up = sensitive data and sensitive actions.

That keeps the UX easy while protecting CDLA.jobs from the obvious attack: “someone got into the driver’s email and now they can see or change everything.”

### Question 11 — TCPA coverage of the follow-up sequence channels

Expanding on Question 4: the 3-day IntelliApp completion follow-up sequence includes potential voice calls.

- If voice calls are placed by human agents (no automated dialer, no prerecorded message), what level of consent is required and is it covered by existing Stage 2 per-carrier consent?
- If voice calls use automated dialing technology or prerecorded voice (which would invoke the stricter TCPA prior express written consent standard), what additional disclosure or consent is required?
- Does the answer depend on whether the calls are placed by CDLA.jobs directly, by PHTP, or by the carrier?
- Should consent language anticipate either or both implementations to preserve flexibility?

Answer

. If calls are made by human agents only

If the 3-day IntelliApp follow-up calls are placed by live human agents, with no autodialer and no prerecorded/artificial voice, the strict TCPA “prior express written consent” requirement generally is not triggered in the same way.

But you still need a lawful basis and clean disclosure. The driver is asking to pursue a carrier and complete an application, so the call is closer to application follow-up / recruiting support than generic telemarketing.

In that case, Stage 2 per-carrier consent can cover it if the language says the driver authorizes CDLA.jobs, PHTP, and/or the selected carrier to contact them by phone, text, and email about that specific carrier opportunity, IntelliApp completion, recruiting steps, reminders, and related application support.

Do not rely on vague “we may contact you” language. Name the parties.

2. If calls use automated dialing or prerecorded/artificial voice

Then you need stronger TCPA language.

The TCPA restricts calls and texts to cell phones using automated dialing technology or artificial/prerecorded voice unless the called party has prior express consent. For telemarketing/promotional calls, the safer standard is prior express written consent with clear disclosures.

For prerecorded message calls, FTC telemarketing guidance says the seller must have the recipient’s prior written agreement to receive such calls, including evidence they are willing to receive prerecorded calls by or on behalf of a specific seller, the phone number, and the recipient’s signature.

For CDLA.jobs, the safer consent should say:

who may call: CDLA.jobs, PHTP, and the selected carrier;
why: application completion, IntelliApp completion, recruiting follow-up, carrier opportunity, reminders;
channels: calls, SMS/texts, email;
technology: automated dialing/messaging systems and artificial or prerecorded voice;
phone number: the number the driver provided;
not required: consent is not required as a condition of using CDLA.jobs or being matched;
opt-out: driver may revoke consent at any time.
3. Does it matter who places the calls?

Yes. The consent needs to match the actual caller/sender.

If CDLA.jobs calls

Stage 2 consent should name CDLA.jobs as a caller.

If PHTP calls

Stage 2 consent should name PHTP specifically. Do not hide PHTP behind “partner” if PHTP is actually calling or routing the IntelliApp process.

If the carrier calls

Stage 2 consent should name the specific selected carrier. This is especially important because the driver is authorizing contact tied to that carrier opportunity.

A clean Stage 2 flow is safer because the driver is choosing a specific carrier, then authorizing contact about that carrier. That is much better than a broad lead-gen consent where hundreds of unnamed parties may call.

4. Should the language anticipate both human and automated implementations?

Yes, but do it with separate checkboxes.

Do not force automated/prerecorded consent just to submit the application if you can avoid it. Use this structure:

Required Stage 2 authorization

Covers human/manual application follow-up.

Optional TCPA automated/prerecorded consent

Covers automated texts, automated calls, and prerecorded/artificial voice.

That gives you flexibility without making your core submit flow dependent on high-risk consent.

Recommended Stage 2 structure
Required checkbox: submit + human follow-up

Use this as the required carrier-submission consent:

I authorize CDLA.jobs to send my intake and prequalification information to PHTP through PHTP’s Tenstreet account and to [Carrier Name] for recruiting, prequalification, IntelliApp completion, application review, and related hiring steps. I also authorize CDLA.jobs, PHTP, and [Carrier Name] to contact me by live phone call, email, or other non-automated communication regarding this carrier opportunity, my application, missing information, or next steps.

Button:

Submit to [Carrier Name]

This should cover live human follow-up calls tied to the specific application.

Optional TCPA checkbox

Use a separate unchecked box:

Optional: I agree that CDLA.jobs, PHTP, and [Carrier Name] may contact me at the phone number I provided about this carrier opportunity, IntelliApp completion, application reminders, recruiting follow-up, and related services by call or text message, including calls or texts made using automated dialing or messaging technology and artificial or prerecorded voice messages. I understand my consent is not required to submit my information, be matched, or pursue this carrier opportunity. Message and data rates may apply. Message frequency may vary. I may revoke consent at any time, including by replying STOP to texts or by any reasonable method.

That is the language I would use if automated or prerecorded calls are possible.

For the 3-day IntelliApp sequence specifically

Use this product rule:

Contact type	Consent needed	Can Stage 2 cover it?
Human call from CDLA.jobs	Stage 2 application/contact authorization	Yes, if CDLA.jobs is named
Human call from PHTP	Stage 2 application/contact authorization	Yes, if PHTP is named
Human call from carrier	Stage 2 application/contact authorization	Yes, if carrier is named
Automated SMS reminder	TCPA consent recommended/required depending technology/content	Only if separate TCPA checkbox covers it
Automated call	TCPA consent required	Only if separate TCPA checkbox covers it
Prerecorded/artificial voice	Prior written consent strongly required	Only if separate TCPA checkbox covers it
Revocation / opt-out handling

TCPA revocation needs to be taken seriously. FCC-related rules require opt-out requests to be honored within a reasonable time, not to exceed 10 business days, and businesses should recognize reasonable revocation methods.

For your system:

STOP opts out of SMS.
“Don’t call me” opts out of calls.
“Remove me” should stop nurture.
Track opt-outs separately by channel and by party where possible.
Communicate opt-outs to PHTP/carrier if they are part of the follow-up sequence.
Blunt recommendation

Build the Stage 2 consent like this:

Required: authorization to send data to PHTP/Tenstreet/[Carrier Name] and allow live human follow-up about that application.
Optional unchecked: TCPA consent for automated SMS/calls and prerecorded/artificial voice by CDLA.jobs, PHTP, and [Carrier Name].
Log both separately.
Do not use automated/prerecorded calls unless the optional TCPA consent is checked.
If only human calls are used, Stage 2 consent is enough if it clearly names CDLA.jobs, PHTP, and the selected carrier.

This gives CDLA.jobs flexibility while keeping the consent clean and defensible.

---

## Format note for attorney response

For each question, the following format would be most useful for downstream implementation:

1. **Answer / approach** — direct response to the question
2. **Approved language** (where applicable) — text that can be used verbatim in consent screens, privacy policy, or other driver-facing surfaces
3. **Conditions or limits** — any restrictions on how the approved language or approach may be used
4. **Cross-references** — any related questions in this list whose answers depend on or affect this one

Questions where the answer is "this needs deeper analysis" or "engage specialized counsel" are welcome — better to flag a gap than to provide a quick answer to a question that warrants more.

---

## Change log

| Date | Change | By |
|------|--------|-----|
| 2026-05-19 | v1 draft prepared for attorney review | Todd + Claude |

---

*End of document.*
