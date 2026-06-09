// Proactive trigger evaluation — pure materiality decisions. Each returns
// a ProactiveCandidate when there's something GENUINELY worth the driver's
// attention, or null when there isn't. Materiality gates live here so no
// trivial difference ever becomes a ping (spec §2, §3).
//
// The four proactive behaviors:
//   step_up    — a stored driver becomes eligible for something materially
//                better than their last-known situation.
//   stay_put   — their current situation beats what's available on what
//                THEY care about → tell them to stay (the trust keystone).
//   re_match   — supply changed (new partner / new lane) and now fits them.
//   milestone  — they're about to cross an experience tier that opens
//                better options.

import { PROACTIVE_CONFIG } from "./config";

export type TriggerType = "step_up" | "stay_put" | "re_match" | "milestone";

export interface ProactiveCandidate {
  triggerType: TriggerType;
  reason: string;
  materialityDetail: string | null;
}

// More home time = a higher level. Mirrors the ranker's intent.
const HOME_LEVEL: Record<string, number> = {
  daily: 4,
  weekly: 3,
  biweekly: 2,
  otr: 1,
};

export interface StepUpInput {
  topPriority: string | null; // driver's #1: pay | home_time | proximity | ...
  currentWeeklyPay: number | null;
  candidateWeeklyPay: number | null;
  currentHomeTime: string | null; // daily | weekly | biweekly | otr
  candidateHomeTime: string | null;
  candidateCarrierName: string;
}

/**
 * Step-up alert. Fires only when a new option beats the driver's
 * last-known job on the dimension THEY ranked first, by a real margin.
 */
export function evaluateStepUp(input: StepUpInput): ProactiveCandidate | null {
  // Pay-first: require a real weekly gain over the materiality threshold.
  if (input.topPriority === "pay") {
    if (input.currentWeeklyPay == null || input.candidateWeeklyPay == null) return null;
    const gain = input.candidateWeeklyPay - input.currentWeeklyPay;
    if (gain >= PROACTIVE_CONFIG.stepUp.minWeeklyPayGainUsd) {
      return {
        triggerType: "step_up",
        reason: `You told me pay comes first — ${input.candidateCarrierName} runs about $${gain.toLocaleString()}/week more than where you are. Worth a look; confirm the number with them.`,
        materialityDetail: `+$${gain}/wk`,
      };
    }
    return null;
  }

  // Home-time-first: require a genuinely better home-time level.
  if (input.topPriority === "home_time") {
    const cur = input.currentHomeTime ? (HOME_LEVEL[input.currentHomeTime] ?? 0) : 0;
    const cand = input.candidateHomeTime ? (HOME_LEVEL[input.candidateHomeTime] ?? 0) : 0;
    if (cand > cur) {
      return {
        triggerType: "step_up",
        reason: `You ranked home time first — ${input.candidateCarrierName} gets you home more often than your current run. Worth a look.`,
        materialityDetail: `${input.currentHomeTime ?? "?"}→${input.candidateHomeTime ?? "?"}`,
      };
    }
    return null;
  }

  // Other priorities have no materiality signal we can defend → don't ping.
  return null;
}

/**
 * "Stay put" guidance — the trust keystone. When the driver is itchy
 * (re-engaging / asking "anything better?") but nothing available beats
 * what they've got on their own priorities, say so plainly.
 */
export function evaluateStayPut(input: {
  driverAskedForBetter: boolean;
  bestAvailableBeatsCurrent: boolean;
}): ProactiveCandidate | null {
  if (input.driverAskedForBetter && !input.bestAvailableBeatsCurrent) {
    return {
      triggerType: "stay_put",
      reason:
        "Honest answer — nothing open right now beats what you've got on the things you care about. I'd stay put, and I'll flag you the second something better shows up.",
      materialityDetail: null,
    };
  }
  return null;
}

/**
 * Milestone check-in — fires when a driver is within the configured
 * window of an experience-tier boundary that opens better options.
 */
export function evaluateMilestone(input: {
  experienceMonths: number;
}): ProactiveCandidate | null {
  const { nearTierWindowMonths, tierBoundariesMonths } = PROACTIVE_CONFIG.milestone;
  for (const boundary of tierBoundariesMonths) {
    const monthsAway = boundary - input.experienceMonths;
    if (monthsAway > 0 && monthsAway <= nearTierWindowMonths) {
      return {
        triggerType: "milestone",
        reason: `You're about ${monthsAway === 1 ? "a month" : `${monthsAway} months`} from the ${boundary}-month mark — a few more clean weeks and better-paying lanes open up. Might be worth waiting for it before you jump.`,
        materialityDetail: `nearing ${boundary}mo`,
      };
    }
  }
  return null;
}
