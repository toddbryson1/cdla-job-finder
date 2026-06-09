// Driver assessment (advisor mode).
//
// "You tell the truth about strengths and weaknesses" — the advisor names
// where a driver is strong and where they're not, directly, without
// judgment, and ALWAYS pairs a weakness with a path forward. A weakness
// is a map, not a sentence (SPEC_debbie-advisor-mode-v2.md).
//
// This is deterministic, rule-based logic (no LLM in the decision path) so
// it's testable and never hallucinates a fact about the driver. The phrasing
// is honest and plain; it never inflates prospects to be nice, and it never
// uses adverse-action "rejected/disqualified" language about the person.

export interface AssessmentInput {
  experienceMonths: number;
  endorsements: string[];
  terminated: boolean;
  sapStatus: "not-in-sap" | "in-sap" | "completed-sap";
  // Stage 2 record fields — often unknown (null) at the Stage 1 match
  // display. When null, the assessment simply doesn't speak to them.
  accidents3yrAtFaultCount?: number | null;
  tickets3yrCount?: number | null;
  duiEver?: boolean | null;
  felonyEver?: boolean | null;
}

export interface Strength {
  label: string;
}

export interface Weakness {
  label: string;
  /** What the driver CAN do about it. Required — never a verdict. */
  pathForward: string;
}

export interface Assessment {
  strengths: Strength[];
  weaknesses: Weakness[];
}

const BETTER_LANE_ENDORSEMENTS = new Set([
  "hazmat",
  "tanker",
  "hazmat-tanker",
  "doubles-triples",
]);

export function assessDriver(input: AssessmentInput): Assessment {
  const strengths: Strength[] = [];
  const weaknesses: Weakness[] = [];

  const months = input.experienceMonths;

  // ── Experience ────────────────────────────────────────────────────
  if (months >= 24) {
    strengths.push({
      label: `${Math.floor(months / 12)}+ years behind the wheel — you've got real options`,
    });
  } else if (months >= 12) {
    strengths.push({
      label: "past the 12-month mark, which opens a lot more carriers to you",
    });
  } else if (months >= 3) {
    weaknesses.push({
      label: "under a year in, so some carriers will want more seat time",
      pathForward:
        "the carriers up top are on-ramps built for exactly where you are — six more clean months opens the 12-month tier with better pay",
    });
  } else {
    weaknesses.push({
      label: "right at the floor — most carriers want 3 to 6 months first",
      pathForward:
        "the on-ramp carriers shown here hire at this stage; string together a few clean months and the whole board opens up",
    });
  }

  // ── Endorsements ──────────────────────────────────────────────────
  const betterLanes = input.endorsements.filter((e) => BETTER_LANE_ENDORSEMENTS.has(e));
  if (betterLanes.length > 0) {
    strengths.push({
      label: `your ${betterLanes.join(" + ")} endorsement opens better-paying lanes most drivers can't run`,
    });
  }

  // ── Separation / SAP ──────────────────────────────────────────────
  if (input.terminated) {
    weaknesses.push({
      label: "a termination on a recent job is a hurdle some carriers weigh heavily",
      pathForward:
        "be straight about it on the application — plenty of drivers in the same spot get hired; the carriers shown here are the ones whose rules fit your situation",
    });
  }

  if (input.sapStatus === "in-sap") {
    weaknesses.push({
      label: "being mid-SAP narrows your options sharply right now",
      pathForward:
        "finishing the return-to-duty program reopens most carriers — it's the single biggest thing you can do for your search",
    });
  } else if (input.sapStatus === "completed-sap") {
    weaknesses.push({
      label: "a completed SAP limits you to carriers that accept it",
      pathForward:
        "the matches here are already filtered to carriers that hire completed-SAP drivers, so you're looking at real options",
    });
  }

  // ── Record (Stage 2 — only when known) ────────────────────────────
  if ((input.accidents3yrAtFaultCount ?? 0) > 0) {
    weaknesses.push({
      label: "an at-fault accident in the last 3 years is a factor carriers look at",
      pathForward:
        "it ages off at the 3-year mark; the carriers shown here are ones whose rules tolerate it",
    });
  }
  if (input.duiEver === true) {
    weaknesses.push({
      label: "a DUI on your record closes some carriers' doors",
      pathForward:
        "recency matters most — the further back it is, the more options open; these matches already account for it",
    });
  }
  if (input.felonyEver === true) {
    weaknesses.push({
      label: "a felony on record narrows the carrier list",
      pathForward:
        "many carriers look at how long ago and what it was — the matches here are ones whose rules fit your situation",
    });
  }

  // ── Clean-record strength (only assert when we actually know it) ───
  const recordKnown =
    input.accidents3yrAtFaultCount != null ||
    input.tickets3yrCount != null ||
    input.duiEver != null ||
    input.felonyEver != null;
  const recordClean =
    recordKnown &&
    (input.accidents3yrAtFaultCount ?? 0) === 0 &&
    (input.tickets3yrCount ?? 0) === 0 &&
    input.duiEver !== true &&
    input.felonyEver !== true;
  if (recordClean && !input.terminated && input.sapStatus === "not-in-sap") {
    strengths.push({
      label: "a clean record — that's the thing carriers screen for first",
    });
  }

  return { strengths, weaknesses };
}
