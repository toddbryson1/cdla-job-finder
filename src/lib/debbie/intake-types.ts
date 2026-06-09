// Pure types + client-safe helpers for the Debbie intake flow. No
// Anthropic SDK imports here so the client bundle stays slim — the
// LLM runtime lives in intake-turn.ts which is server-only.

export type DebbieIntakeState =
  | "Q1_zip"
  | "Q2_experience"
  | "Q3_schedule"
  | "Q4_termination"
  | "Q4_termination_probe"
  | "Q5_sap"
  // Advisor-mode follow-ups (only reached when advisor mode is on). Q6
  // captures the keystone priority ranking; Q7 the career goal. Both
  // optional — a driver can decline and the flow still completes.
  | "Q6_priority"
  | "Q7_career"
  | "confirmation"
  | "consent_ready";

export type CareerGoalType =
  | "more_pay"
  | "different_equipment"
  | "endorsement"
  | "home_time"
  | "own_authority"
  | "none";

export interface DebbieIntakeMessage {
  role: "user" | "assistant";
  content: string;
}

// Per-turn extraction. All optional — the model only fills what it
// actually heard.
export interface DebbieIntakeExtracted {
  homeZip?: string;
  experienceYears?: number;
  schedule?: "local" | "regional" | "otr" | "any";
  terminatedLastJob?: boolean;
  terminationReason?: string;
  sapStatus?: "not-in-sap" | "in-sap" | "completed-sap";
  // Advisor-mode follow-ups (migration 0033). Ordered priority is the
  // keystone the ranker weights around.
  priorityRanking?: Array<"pay" | "home_time" | "proximity" | "ease_of_hire">;
  careerGoalType?: CareerGoalType;
  careerGoalDetail?: string;
}

// Accumulated state across turns.
export interface DebbieIntakeFields {
  homeZip: string | null;
  experienceYears: number | null;
  schedule: "local" | "regional" | "otr" | "any" | null;
  terminatedLastJob: boolean | null;
  terminationReason: string | null;
  sapStatus: "not-in-sap" | "in-sap" | "completed-sap" | null;
  // Advisor-mode follow-ups (migration 0033). Null when not asked
  // (advisor mode off) or declined — the ranker treats null as neutral.
  priorityRanking:
    | Array<"pay" | "home_time" | "proximity" | "ease_of_hire">
    | null;
  careerGoalType: CareerGoalType | null;
  careerGoalDetail: string | null;
}

export const EMPTY_FIELDS: DebbieIntakeFields = {
  homeZip: null,
  experienceYears: null,
  schedule: null,
  terminatedLastJob: null,
  terminationReason: null,
  sapStatus: null,
  priorityRanking: null,
  careerGoalType: null,
  careerGoalDetail: null,
};

export function mergeExtracted(
  fields: DebbieIntakeFields,
  extracted: DebbieIntakeExtracted,
): DebbieIntakeFields {
  return {
    homeZip: extracted.homeZip ?? fields.homeZip,
    experienceYears: extracted.experienceYears ?? fields.experienceYears,
    schedule: extracted.schedule ?? fields.schedule,
    terminatedLastJob:
      extracted.terminatedLastJob ?? fields.terminatedLastJob,
    terminationReason: extracted.terminationReason ?? fields.terminationReason,
    sapStatus: extracted.sapStatus ?? fields.sapStatus,
    priorityRanking: extracted.priorityRanking ?? fields.priorityRanking,
    careerGoalType: extracted.careerGoalType ?? fields.careerGoalType,
    careerGoalDetail: extracted.careerGoalDetail ?? fields.careerGoalDetail,
  };
}

// Maps Debbie's Q3 schedule choice → the existing intake-schema's
// home_time enum array. Used by the client when constructing the
// final /api/intake POST.
//   local    → ["daily"]
//   regional → ["weekly"]
//   otr      → ["otr"]
//   any      → all four
export function scheduleToHomeTime(
  s: DebbieIntakeFields["schedule"],
): Array<"daily" | "weekly" | "biweekly" | "otr"> {
  switch (s) {
    case "local":
      return ["daily"];
    case "regional":
      return ["weekly"];
    case "otr":
      return ["otr"];
    case "any":
      return ["daily", "weekly", "biweekly", "otr"];
    default:
      return ["weekly"];
  }
}
