// Debbie's intake turn handler. One LLM call per driver message: takes
// the conversation so far + which Stage 1 question is active + fields
// gathered, returns extracted fields, the next assistant message, and
// the next conversation state. Stateless server-side — the client owns
// the conversation state and replays it each turn.
//
// Voice rules + Stage 1 question order are locked per
// SPEC_conversational-ai-intake-v1.md §3.1 + §4. Five Stage 1 questions:
//   Q1  home zip
//   Q2  experience years
//   Q3  schedule preference (local / regional / OTR / any)
//   Q4  termination probe (yes → soft-probe reason)
//   Q5  SAP status
// Then a confirmation step ("Let me play that back…") and consent.
//
// Stage 2 (tickets, accidents, criminal) is per-carrier and lives at
// /apply. It is NOT Debbie's responsibility here.

import Anthropic from "@anthropic-ai/sdk";
import type {
  DebbieIntakeExtracted,
  DebbieIntakeFields,
  DebbieIntakeMessage,
  DebbieIntakeState,
} from "@/lib/debbie/intake-types";

const MODEL = "claude-haiku-4-5";
const MAX_TURNS_HISTORY = 24; // 12 user + 12 assistant turns
const MAX_MESSAGE_CHARS = 600;

// Re-export so callers can keep importing from intake-turn during
// transition. New code should import types directly from intake-types.
export type {
  DebbieIntakeExtracted,
  DebbieIntakeFields,
  DebbieIntakeMessage,
  DebbieIntakeState,
} from "@/lib/debbie/intake-types";

export interface DebbieIntakeTurnInput {
  /** Where the driver currently is in the flow. */
  state: DebbieIntakeState;
  /** Whole conversation transcript so far, oldest first. */
  conversation: DebbieIntakeMessage[];
  /** Fields gathered from prior turns. Merged with this turn's extract. */
  fields: DebbieIntakeFields;
  /**
   * Advisor mode (set server-side from ADVISOR_MODE_ENABLED). When true,
   * Debbie asks two optional follow-ups after Q5 — Q6 priority ranking
   * and Q7 career goal — before confirmation. When false/undefined the
   * flow is the original five questions → confirmation, unchanged.
   */
  advisorMode?: boolean;
}

export interface DebbieIntakeTurnResult {
  /** What Debbie says next — append to the transcript client-side. */
  assistantMessage: string;
  /** Fields extracted from the driver's latest message. */
  extracted: DebbieIntakeExtracted;
  /** Where to move next. May be the same state if clarification needed. */
  nextState: DebbieIntakeState;
  tokens: { input: number; output: number };
}

// Tool schema the model fills. Keeping all extracted fields optional
// lets the model emit "I extracted nothing this turn" without inventing
// data — which Debbie should NEVER do.
const DEBBIE_TURN_TOOL: Anthropic.Tool = {
  name: "debbie_turn",
  description:
    "Record what Debbie understood from the driver's latest message and what to say next. Only fill `extracted` fields you can confirm from what the driver actually said — never guess.",
  input_schema: {
    type: "object",
    properties: {
      extracted: {
        type: "object",
        description:
          "Fields extracted from the latest driver message. Omit anything not clearly stated.",
        properties: {
          home_zip: {
            type: "string",
            description:
              "5-digit US zip if the driver said one. Convert 'Atlanta, GA' or 'near Phoenix' to a zip ONLY if you're sure of the city — otherwise omit and ask a clarifying question.",
          },
          experience_years: {
            type: "number",
            description:
              "Decimal years, so '18 months' → 1.5, 'just got my CDL' → 0, '8 years' → 8. Ranges → midpoint.",
          },
          schedule: {
            type: "string",
            enum: ["local", "regional", "otr", "any"],
            description:
              "Driver schedule preference. 'home every night' → local, 'home weekly' → regional, 'home every 2-3 weeks' → otr, 'I'm flexible' → any.",
          },
          terminated_last_job: {
            type: "boolean",
            description:
              "true if the driver said they were let go from their last trucking job; false if they left on their own terms.",
          },
          termination_reason: {
            type: "string",
            description:
              "Free-text reason captured verbatim from the driver after the soft probe. Don't paraphrase.",
          },
          sap_status: {
            type: "string",
            enum: ["not-in-sap", "in-sap", "completed-sap"],
            description:
              "'I've never had a positive DOT test' → not-in-sap. 'I'm currently in SAP' → in-sap. 'I finished SAP' → completed-sap.",
          },
          priority_ranking: {
            type: "array",
            items: {
              type: "string",
              enum: ["pay", "home_time", "proximity", "ease_of_hire"],
            },
            description:
              "ADVISOR ONLY (Q6). The driver's priorities in THEIR stated order, most important first. 'pay matters most, then home time' → ['pay','home_time']. Only include what they actually said; omit if they decline.",
          },
          career_goal_type: {
            type: "string",
            enum: [
              "more_pay",
              "different_equipment",
              "endorsement",
              "home_time",
              "own_authority",
              "none",
            ],
            description:
              "ADVISOR ONLY (Q7). Where the driver wants to move up to. 'get into reefer' → different_equipment. 'working toward hazmat' → endorsement. 'my own authority someday' → own_authority. 'just need a job now' → none.",
          },
          career_goal_detail: {
            type: "string",
            description:
              "ADVISOR ONLY (Q7). Free-text specifics for the goal, e.g. the target equipment ('reefer') or endorsement ('hazmat'). Omit if not stated.",
          },
        },
      },
      assistant_message: {
        type: "string",
        description:
          "What Debbie says next. Two to four sentences max. No emojis. No corporate buzzwords. Match the brand voice in the system prompt.",
      },
      next_state: {
        type: "string",
        enum: [
          "Q1_zip",
          "Q2_experience",
          "Q3_schedule",
          "Q4_termination",
          "Q4_termination_probe",
          "Q5_sap",
          "Q6_priority",
          "Q7_career",
          "confirmation",
          "consent_ready",
        ],
        description:
          "Where to move next. Stay on the same state if you need a clarifying question; advance only when you actually extracted the field.",
      },
    },
    required: ["assistant_message", "next_state"],
  },
};

const SYSTEM_PROMPT_BASE = `You are Debbie, the AI job matcher at CDLA.jobs. You're running the Stage 1 intake conversation with a Class A CDL driver. Your job is to collect five things in a warm, plain conversation, then hand off to the matching engine.

THE FIVE THINGS, IN ORDER:
1. Home zip (Q1_zip)
2. Years of tractor-trailer experience (Q2_experience)
3. Schedule preference: regional / OTR / local / any (Q3_schedule)
4. Were they terminated from their last trucking job? If yes, soft-probe the reason once (Q4_termination → Q4_termination_probe)
5. SAP driver status (Q5_sap)

After Q5 you go to confirmation (replay back what they told you so they can correct anything), then consent_ready (the consent screen renders client-side after this).

VOICE
- Warm, driver-first, direct. Think "knowledgeable friend who works in trucking."
- No corporate buzzwords. No "synergy," "leverage," "transformation."
- No emojis. One exclamation point max in a whole answer, only if it really lands.
- Don't claim to be a real trucker — you're AI and the driver knows it. Don't pretend to have a hometown, family, or a truck.
- Don't make hiring decisions or promise outcomes.
- Keep answers short. Two to four sentences. Drivers reading on a phone don't want paragraphs.

RULES
- Ask one question at a time. Don't compound.
- If a driver answer is unclear, ask ONE clarifying question. Stay on the same state. Don't advance the state until you actually extracted the field.
- Don't invent details. If the driver says "around Phoenix" without a zip, ask for the zip rather than guessing.
- If the driver mentions something out of scope (a specific carrier, pay numbers, equipment), acknowledge briefly and steer back to the current question.
- Termination probe: if the driver says they WERE terminated, you ask once for the reason in their own words. Don't push for more after they answer — just acknowledge and move on. If the reason looks cause-based (accident, safety violation, drug/alcohol, attendance), set honest expectations briefly: "Real talk — that's going to make it harder, but plenty of drivers in the same spot find work."
- SAP probe: if the driver doesn't know what SAP means, offer the one-line explanation in the spec: "SAP stands for Substance Abuse Professional. If you've ever had a positive DOT drug or alcohol test, you'd know — you'd have gone through a return-to-duty program. If none of that rings a bell, you're not a SAP driver."
- Confirmation step: when you reach state "confirmation", play back the five fields in a single sentence and ask "Sound right?" Wait for the driver to confirm. If they correct anything, patch the extracted fields and stay in confirmation. When they confirm, move to consent_ready and tell them the consent step is coming next.

ALWAYS use the debbie_turn tool to respond. Never reply with plain text. Fill only the extracted fields you actually heard the driver say — leave the rest unset.`;

// Appended only in advisor mode. Inserts two optional follow-ups between
// Q5 and confirmation. Optional = a driver can decline ("whatever fits",
// "not sure") and Debbie records nothing and moves on — never badger.
const ADVISOR_FOLLOWUPS = `

ADVISOR FOLLOW-UPS (after Q5, before confirmation)
After SAP (Q5), ask these two before you play things back. They make the
match sharper but are OPTIONAL — if a driver brushes one off, record
nothing for it and move to the next state. Never push.

6. Priorities (Q6_priority): "When it comes to the job, what matters most
   to you — the pay, getting home more, staying close to home, or just
   getting hired fast?" Capture their ORDER into priority_ranking (most
   important first). If they only name one, that's fine — capture the one.
   Then go to Q7_career.
7. Career goal (Q7_career): "And where are you trying to take this —
   bigger paychecks, different equipment, an endorsement like hazmat or
   tanker, better home time, or your own authority someday?" Capture
   career_goal_type (+ career_goal_detail for the specific equipment or
   endorsement). If they just want a job now, that's career_goal_type
   'none'. Then go to confirmation.

When you reach confirmation, you may mention their top priority in the
playback if they gave one, but keep it short.`;

function buildSystemPrompt(input: DebbieIntakeTurnInput): string {
  const f = input.fields;
  const known = [
    f.homeZip ? `zip=${f.homeZip}` : null,
    f.experienceYears != null ? `experience_years=${f.experienceYears}` : null,
    f.schedule ? `schedule=${f.schedule}` : null,
    f.terminatedLastJob != null
      ? `terminated_last_job=${f.terminatedLastJob}`
      : null,
    f.terminationReason ? `termination_reason="${f.terminationReason}"` : null,
    f.sapStatus ? `sap_status=${f.sapStatus}` : null,
    input.advisorMode && f.priorityRanking
      ? `priority_ranking=[${f.priorityRanking.join(",")}]`
      : null,
    input.advisorMode && f.careerGoalType
      ? `career_goal=${f.careerGoalType}`
      : null,
  ]
    .filter(Boolean)
    .join(", ");

  // In advisor mode, Q5 flows into the two follow-ups; otherwise straight
  // to confirmation (the base prompt's behavior).
  const flow = input.advisorMode
    ? ADVISOR_FOLLOWUPS
    : "";

  return `${SYSTEM_PROMPT_BASE}${flow}

CURRENT STATE
- conversation_state: ${input.state}
- fields_gathered: ${known || "(none yet)"}

Move to the next question only when you have what the current question is asking for.`;
}

export async function runDebbieIntakeTurn(
  input: DebbieIntakeTurnInput,
): Promise<DebbieIntakeTurnResult> {
  if (input.conversation.length === 0) {
    throw new Error("Conversation must have at least one message");
  }
  const last = input.conversation[input.conversation.length - 1];
  if (last.role !== "user") {
    throw new Error("Last message must be from user");
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  const client = new Anthropic({ apiKey });

  const trimmed = input.conversation.slice(-MAX_TURNS_HISTORY).map((m) => ({
    role: m.role,
    content: m.content.slice(0, MAX_MESSAGE_CHARS),
  }));

  // Per-request timeout. The route's maxDuration is 30s on Vercel,
  // but this is the chat — the driver is staring at the typing
  // indicator. 15s is well below human-patience-runs-out and leaves
  // plenty of margin under maxDuration so a timeout still returns a
  // clean response (the chat surfaces it as "Couldn't reach Debbie")
  // rather than getting platform-killed mid-stream.
  const res = await client.messages.create(
    {
      model: MODEL,
      max_tokens: 600,
      system: buildSystemPrompt(input),
      tools: [DEBBIE_TURN_TOOL],
      tool_choice: { type: "tool", name: DEBBIE_TURN_TOOL.name },
      messages: trimmed,
    },
    { timeout: 15_000 },
  );

  const toolBlock = res.content.find((b) => b.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") {
    throw new Error("Debbie didn't return a tool_use block");
  }
  const parsed = parseToolPayload(toolBlock.input);

  return {
    assistantMessage: parsed.assistantMessage,
    extracted: parsed.extracted,
    nextState: parsed.nextState,
    tokens: {
      input: res.usage.input_tokens,
      output: res.usage.output_tokens,
    },
  };
}

// Defensive parser — the SDK types tool_use.input as `unknown`. Validate
// at runtime so a malformed model response doesn't blow up the route.
function parseToolPayload(raw: unknown): {
  assistantMessage: string;
  extracted: DebbieIntakeExtracted;
  nextState: DebbieIntakeState;
} {
  if (!raw || typeof raw !== "object") {
    throw new Error("Tool payload is not an object");
  }
  const obj = raw as Record<string, unknown>;

  const assistantMessage =
    typeof obj.assistant_message === "string" && obj.assistant_message.trim()
      ? obj.assistant_message.trim()
      : null;
  if (!assistantMessage) {
    throw new Error("Tool payload missing assistant_message");
  }

  const nextStateRaw =
    typeof obj.next_state === "string" ? obj.next_state : null;
  const validStates: DebbieIntakeState[] = [
    "Q1_zip",
    "Q2_experience",
    "Q3_schedule",
    "Q4_termination",
    "Q4_termination_probe",
    "Q5_sap",
    "Q6_priority",
    "Q7_career",
    "confirmation",
    "consent_ready",
  ];
  if (!nextStateRaw || !validStates.includes(nextStateRaw as DebbieIntakeState)) {
    throw new Error(`Tool payload has invalid next_state: ${nextStateRaw}`);
  }
  const nextState = nextStateRaw as DebbieIntakeState;

  const extractedObj =
    obj.extracted && typeof obj.extracted === "object"
      ? (obj.extracted as Record<string, unknown>)
      : {};
  const extracted: DebbieIntakeExtracted = {};

  if (typeof extractedObj.home_zip === "string") {
    const z = extractedObj.home_zip.trim();
    if (/^\d{5}$/.test(z)) extracted.homeZip = z;
  }
  if (typeof extractedObj.experience_years === "number" && extractedObj.experience_years >= 0) {
    extracted.experienceYears = Math.min(60, extractedObj.experience_years);
  }
  if (
    typeof extractedObj.schedule === "string" &&
    ["local", "regional", "otr", "any"].includes(extractedObj.schedule)
  ) {
    extracted.schedule = extractedObj.schedule as DebbieIntakeExtracted["schedule"];
  }
  if (typeof extractedObj.terminated_last_job === "boolean") {
    extracted.terminatedLastJob = extractedObj.terminated_last_job;
  }
  if (typeof extractedObj.termination_reason === "string") {
    const r = extractedObj.termination_reason.trim().slice(0, 2000);
    if (r.length > 0) extracted.terminationReason = r;
  }
  if (
    typeof extractedObj.sap_status === "string" &&
    ["not-in-sap", "in-sap", "completed-sap"].includes(extractedObj.sap_status)
  ) {
    extracted.sapStatus = extractedObj.sap_status as DebbieIntakeExtracted["sapStatus"];
  }

  // Advisor follow-ups. Validate against the allowed token sets so a
  // malformed model response can't write junk into the profile.
  if (Array.isArray(extractedObj.priority_ranking)) {
    const allowed = ["pay", "home_time", "proximity", "ease_of_hire"];
    const seen = new Set<string>();
    const ranking = extractedObj.priority_ranking
      .filter((v): v is string => typeof v === "string" && allowed.includes(v))
      .filter((v) => (seen.has(v) ? false : (seen.add(v), true)));
    if (ranking.length > 0) {
      extracted.priorityRanking =
        ranking as DebbieIntakeExtracted["priorityRanking"];
    }
  }
  if (
    typeof extractedObj.career_goal_type === "string" &&
    [
      "more_pay",
      "different_equipment",
      "endorsement",
      "home_time",
      "own_authority",
      "none",
    ].includes(extractedObj.career_goal_type)
  ) {
    extracted.careerGoalType =
      extractedObj.career_goal_type as DebbieIntakeExtracted["careerGoalType"];
  }
  if (typeof extractedObj.career_goal_detail === "string") {
    const d = extractedObj.career_goal_detail.trim().slice(0, 500);
    if (d.length > 0) extracted.careerGoalDetail = d;
  }

  return { assistantMessage, extracted, nextState };
}

// mergeExtracted, EMPTY_FIELDS, scheduleToHomeTime moved to
// intake-types.ts so the client bundle doesn't pull in the Anthropic
// SDK. Re-export them here for callers transitioning to the new path.
export {
  EMPTY_FIELDS,
  mergeExtracted,
  scheduleToHomeTime,
} from "@/lib/debbie/intake-types";
