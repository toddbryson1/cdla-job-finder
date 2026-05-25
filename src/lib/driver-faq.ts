// Driver-facing FAQ entries. Source of truth for both:
//   - Per-landing-page FAQ on /jobs/[region-equipment] (uses STANDARD_FAQ
//     plus regionally/equipment-specific additions)
//   - The standalone /faq page (uses STANDARD_FAQ + EXTENDED_FAQ)
//
// Voice: driver-facing per Brand Voice Guide §3 — warm, direct, slightly
// sarcastic toward the industry, never toward the driver. No emojis,
// no exclamation points.

export interface FaqEntry {
  q: string;
  a: string;
}

// Questions that appear on every landing page. Copy is locked — these
// have been on production landing pages since launch. Do not edit
// without updating both surfaces.
export const STANDARD_FAQ: FaqEntry[] = [
  {
    q: "Is this free?",
    a: "Yes. CDLA.jobs is free for drivers. Always will be. Carriers pay us if they want priority access — drivers never do.",
  },
  {
    q: "How is this different from Indeed?",
    a: "We don't sell your info to every recruiter on earth. You decide which carriers see your information. We don't show you jobs that don't fit what you said you wanted. We don't bombard you. If a job board feels like it's working against you, it probably is. We're built the other way.",
  },
  {
    q: "How long does it take to fill out the intake?",
    a: "About 6 minutes if you know your own work history. We ask CDL details, equipment experience, what you want, and the safety stuff carriers ask on every application. We ask once. Carriers ask it every single time.",
  },
  {
    q: "What happens after I submit?",
    a: "Within a few minutes, we run your profile against every carrier in our system. You'll get an email with your matches. You pick which carriers to share your info with. Their recruiters contact you directly to start their hiring process. We get out of the way after that.",
  },
  {
    q: "Do you do my background check?",
    a: "No. That's the carrier's job, not ours. When a carrier you picked wants to consider you, they'll send you their full application with the background check forms inside it. You sign those with them. We don't run PSP reports. We don't pull MVRs. We don't contact your old employers.",
  },
  {
    q: "What if I don't see matches I like?",
    a: "That can happen. Sometimes the carriers we work with don't have a perfect fit at the moment. We keep watching for matches as new carriers join and new positions open up. If something matches what you wanted, we email you. You don't have to keep checking.",
  },
  {
    q: "Can I stop the emails?",
    a: "Yes. Reply STOP to any text. Click unsubscribe on any email. Or just tell us. We stop. Forever. No questions, no 'are you sure' loop.",
  },
];

// Additional questions that live only on the standalone /faq page. These
// answer questions that come up on the broader site (not on landing pages).
export const EXTENDED_FAQ: FaqEntry[] = [
  {
    q: "Who's Debbie?",
    a: "Debbie is the AI driver matcher on CDLA.jobs. She asks the intake questions in conversation, the same questions a recruiter would ask, except faster and only once. She's AI and says so out loud. She doesn't pretend to be a person. While we finish building her, the same intake is available as a 6-minute form.",
  },
  {
    q: "I have a DUI, felony, or accident on my record. Am I out?",
    a: "Probably not. Carrier requirements vary widely. Some carriers won't consider drivers with a DUI in the last 5 years; others will. Some accept felonies; others won't. We ask you about your record at intake and only show you carriers whose stated requirements your record fits. You see what's possible for your actual situation, not a generic 'sorry.'",
  },
  {
    q: "I'm in SAP. Can you help?",
    a: "Some carriers hire drivers in SAP. Some only hire drivers who have completed SAP. Some don't accept either. Tell us your status at intake and we'll only show you carriers whose policy matches. We don't pretend the carriers who won't consider you exist.",
  },
  {
    q: "Why do I need to sign in to see my matches?",
    a: "Your matches are tied to your email. When you click the link in your email to view them, we send a one-time sign-in link to that same email and you click it. That keeps anyone else from seeing your matches even if they get your driver ID. No password to remember.",
  },
  {
    q: "I didn't get my match email. What's wrong?",
    a: "Check spam first — new email senders sometimes land there until the inbox learns to trust us. If it's not there, the email you typed at intake might have a typo. Start a new intake at the right email, or email sales@cdla.jobs and we'll dig in.",
  },
  {
    q: "Can I update my preferences after I submit?",
    a: "Yes. Go through the intake again with the same email — we update your existing profile instead of creating a duplicate. Your matches refresh based on the new answers.",
  },
  {
    q: "What information do you share with carriers?",
    a: "Only the carriers you specifically pick get your information. What gets shared: name, contact info, CDL details, work history you provided, equipment experience, schedule preferences, the safety answers you gave at intake. Carriers verify everything in their own application process — they don't take our word for it.",
  },
  {
    q: "How do I delete my account?",
    a: "Email sales@cdla.jobs and ask. We'll remove your profile, your match history, and your contact info from our systems. Carriers you already released your information to have their own copies — you'd need to contact them separately to ask them to delete it. We'll give you the list.",
  },
];
