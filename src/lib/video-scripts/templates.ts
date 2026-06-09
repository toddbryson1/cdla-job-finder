// The 6 video-script templates from docs/CDLAjobs_Video_Script_Template.docx
// (Sections 4–9). Copy is CANONICAL — do not improvise; the doc is the
// source of truth, same rule as the landing-page template.
//
// Each script is the 5-part structure (hook / specific claim / problem /
// what CDLA.jobs does / CTA). Variables are [[double_bracketed]] and
// resolved at generation time (see ./index.ts). Token casing is
// significant: [[Equipment_humanized]] capitalizes the first letter,
// [[equipment_humanized]] does not — the renderer handles this.

export interface ScriptPart {
  part: string;
  timecode: string;
  /** Spoken voiceover line(s). */
  voiceover: string;
  /** On-screen text annotation. */
  onScreen: string;
}

export interface VideoScriptTemplate {
  key: string;
  name: string;
  bestFor: string;
  /** Variable keys that must resolve non-null or the template is skipped. */
  requiredVars: string[];
  parts: ScriptPart[];
}

export const VIDEO_SCRIPT_TEMPLATES: VideoScriptTemplate[] = [
  {
    key: "pay-focused",
    name: "Pay-Focused",
    bestFor:
      "Regions/equipment where pay is the strongest signal. Higher-than-average pay, hard-to-fill, specialty equipment.",
    requiredVars: [
      "equipment",
      "equipment_humanized",
      "region",
      "region_short",
      "pay_low",
      "pay_high",
      "short_url",
    ],
    parts: [
      {
        part: "Hook",
        timecode: "0-3 sec",
        voiceover:
          "[[Equipment_humanized]]s in [[Region_short]] are making [[pay_low]] to [[pay_high]] a week right now.",
        onScreen:
          "[[Equipment]] drivers, [[Region]], [[pay_low]] - [[pay_high]]/wk",
      },
      {
        part: "Specific claim",
        timecode: "3-12 sec",
        voiceover:
          "That's not a 'we'll pay you up to' number. That's the actual range carriers in our system are paying right now.",
        onScreen: "Real numbers from carriers actively hiring",
      },
      {
        part: "The problem",
        timecode: "12-22 sec",
        voiceover:
          "Most job sites won't even tell you what the pay is until you apply. Then you spend 20 minutes on an application to find out they're paying 30 cents a mile.",
        onScreen: "Stock footage of frustrated phone scrolling",
      },
      {
        part: "What CDLA.jobs does",
        timecode: "22-35 sec",
        voiceover:
          "CDLA.jobs is different. Fill out one intake about what you want and what you bring. If a carrier won't tell us what they pay, we won't show them to you. Period.",
        onScreen: "Intake form preview, 'one form, real matches'",
      },
      {
        part: "CTA",
        timecode: "35-45 sec",
        voiceover:
          "Tap the link in bio or go to [[short_url]] to find your matches in [[Region]]. Takes 6 minutes.",
        onScreen: "[[short_url]] - large, centered, easy to read",
      },
    ],
  },
  {
    key: "anti-indeed",
    name: "Anti-Indeed (Frustration-Focused)",
    bestFor:
      "Any region/equipment, broadly applicable. Plays on universal driver frustration with job boards. Best for volume/awareness.",
    requiredVars: [
      "equipment",
      "equipment_humanized",
      "region",
      "region_short",
      "short_url",
    ],
    parts: [
      {
        part: "Hook",
        timecode: "0-3 sec",
        voiceover:
          "If you're a CDL-A driver in [[Region]] still using Indeed, this is for you.",
        onScreen: "CDL-A driver, [[Region]]",
      },
      {
        part: "Specific claim",
        timecode: "3-12 sec",
        voiceover:
          "Indeed sells your information to every recruiter who pays for it. That's why you get 30 calls a week from people pitching jobs you don't want.",
        onScreen: "Phone with notifications cascading, 'sound familiar?'",
      },
      {
        part: "The problem",
        timecode: "12-22 sec",
        voiceover:
          "Half those jobs are for equipment you don't run. Half pay less than you're making. And exactly zero of those recruiters listened when you said you only wanted [[equipment_humanized]] work.",
        onScreen: "'You said: [[equipment]]. They sent: everything else.'",
      },
      {
        part: "What CDLA.jobs does",
        timecode: "22-35 sec",
        voiceover:
          "CDLA.jobs is built the other way. Fill out one intake. We match you to carriers actually hiring [[equipment_humanized]] in [[Region_short]]. You decide which ones get your info. Nobody else does.",
        onScreen:
          "Intake -> Match -> Carriers contact you. Driver in control.",
      },
      {
        part: "CTA",
        timecode: "35-45 sec",
        voiceover:
          "Link in bio. [[short_url]]. Six minutes. Free for drivers. We don't sell your number.",
        onScreen: "[[short_url]]",
      },
    ],
  },
  {
    key: "volume-focused",
    name: "Volume-Focused",
    bestFor: "Regions with high carrier counts. Plays on the 'lots of options' angle.",
    requiredVars: [
      "carrier_count",
      "equipment",
      "equipment_humanized",
      "region",
      "region_short",
      "short_url",
    ],
    parts: [
      {
        part: "Hook",
        timecode: "0-3 sec",
        voiceover:
          "[[carrier_count]] carriers in [[Region_short]] are hiring [[equipment_humanized]]s right now.",
        onScreen: "[[carrier_count]] carriers - [[Region]] - [[equipment]]",
      },
      {
        part: "Specific claim",
        timecode: "3-12 sec",
        voiceover:
          "Not 'available positions on the platform.' Not 'opportunities for qualified drivers.' Real carriers, in your region, actively hiring.",
        onScreen: "Real carriers, real positions",
      },
      {
        part: "The problem",
        timecode: "12-22 sec",
        voiceover:
          "Most drivers find jobs the hard way. Apply to 20 places. Hear back from 3. One of those is a scam. By week 4 you take whatever's in front of you, not what fits.",
        onScreen: "Calendar weeks crossing off, frustrated driver",
      },
      {
        part: "What CDLA.jobs does",
        timecode: "22-35 sec",
        voiceover:
          "CDLA.jobs lets you see your matches from all [[carrier_count]] carriers in one place. You pick which ones you want to share your info with. Carriers reach out. You take your time.",
        onScreen: "Match list interface preview",
      },
      {
        part: "CTA",
        timecode: "35-45 sec",
        voiceover:
          "Tap the link or go to [[short_url]]. Find your matches in [[Region]] in 6 minutes.",
        onScreen: "[[short_url]]",
      },
    ],
  },
  {
    key: "home-time",
    name: "Home-Time Focused",
    bestFor:
      "Regions/equipment where home time is the key differentiator. Local/regional positions, drivers transitioning from OTR.",
    requiredVars: ["region", "equipment_humanized", "home_time", "short_url"],
    parts: [
      {
        part: "Hook",
        timecode: "0-3 sec",
        voiceover: "Tired of being out three weeks at a time?",
        onScreen: "Calendar showing 21 days OTR",
      },
      {
        part: "Specific claim",
        timecode: "3-12 sec",
        voiceover:
          "Carriers in [[Region]] are hiring [[equipment_humanized]]s for [[home_time]] home time. Real schedules. Not 'home when you can be.'",
        onScreen: "[[Region]] - [[equipment]] - [[home_time]] home",
      },
      {
        part: "The problem",
        timecode: "12-22 sec",
        voiceover:
          "Most carriers advertise flexible home time. Then dispatch tells you it depends on the load. You signed up for weekends home and ended up out for 12 days.",
        onScreen: "'Promised: home weekends. Actual: 12 days out.'",
      },
      {
        part: "What CDLA.jobs does",
        timecode: "22-35 sec",
        voiceover:
          "CDLA.jobs only matches you to carriers whose actual home time policy lines up with what you said you wanted. If a carrier won't commit to it, we won't show them to you.",
        onScreen: "Match cards showing home time matches",
      },
      {
        part: "CTA",
        timecode: "35-45 sec",
        voiceover:
          "[[short_url]]. Six minutes. Find [[equipment_humanized]] jobs that respect your time.",
        onScreen: "[[short_url]]",
      },
    ],
  },
  {
    key: "compliance",
    name: "Compliance/Background Honesty",
    bestFor:
      "Drivers with accidents, violations, or other history. An underserved audience that responds to direct, non-judgmental copy.",
    requiredVars: ["short_url"],
    parts: [
      {
        part: "Hook",
        timecode: "0-3 sec",
        voiceover:
          "Got a DUI in your past? Accident on your record? You're not done.",
        onScreen: "Not done. Just specific.",
      },
      {
        part: "Specific claim",
        timecode: "3-12 sec",
        voiceover:
          "Some carriers will hire you. Some won't. The trick is knowing which is which without applying to 40 places and getting rejected.",
        onScreen: "Don't waste time on no's",
      },
      {
        part: "The problem",
        timecode: "12-22 sec",
        voiceover:
          "Indeed shows you every job whether you qualify or not. You apply, you hope, you wait. Most don't write back. Some do, but only to reject you.",
        onScreen: "Application sent. Rejected. Rejected. Rejected.",
      },
      {
        part: "What CDLA.jobs does",
        timecode: "22-35 sec",
        voiceover:
          "CDLA.jobs asks about your history once. Then we only match you to carriers who actually hire drivers with your background. No surprises, no wasted applications. Honest matching.",
        onScreen: "Honest matching. No surprises.",
      },
      {
        part: "CTA",
        timecode: "35-45 sec",
        voiceover: "Be honest, get matched honestly. [[short_url]].",
        onScreen: "[[short_url]]",
      },
    ],
  },
  {
    key: "new-driver",
    name: "New Driver / Recent CDL",
    bestFor:
      "Drivers with less than 2 years experience. Smaller audience but high lifetime value if matched well.",
    requiredVars: ["region", "short_url"],
    parts: [
      {
        part: "Hook",
        timecode: "0-3 sec",
        voiceover: "New CDL? Most job boards treat you like you don't exist.",
        onScreen: "New CDL holders - here's the truth",
      },
      {
        part: "Specific claim",
        timecode: "3-12 sec",
        voiceover:
          "Some carriers will not hire under 2 years experience, period. But plenty will. CDLA.jobs only matches you to the ones that actually hire new drivers.",
        onScreen: "Matched to carriers that hire new drivers",
      },
      {
        part: "The problem",
        timecode: "12-22 sec",
        voiceover:
          "You apply to a Class A position. You don't qualify. You apply to another. Same. Some boards don't even tell you - they just don't respond.",
        onScreen: "'Application sent. Silence.'",
      },
      {
        part: "What CDLA.jobs does",
        timecode: "22-35 sec",
        voiceover:
          "Tell us your real experience, including the fact you're new. We match you to carriers in [[Region]] that hire new drivers. No applying to positions you won't get.",
        onScreen: "Real experience -> real matches",
      },
      {
        part: "CTA",
        timecode: "35-45 sec",
        voiceover:
          "[[short_url]]. Get matched to carriers that actually hire new drivers.",
        onScreen: "[[short_url]]",
      },
    ],
  },
];

export function getTemplate(key: string): VideoScriptTemplate | undefined {
  return VIDEO_SCRIPT_TEMPLATES.find((t) => t.key === key);
}
