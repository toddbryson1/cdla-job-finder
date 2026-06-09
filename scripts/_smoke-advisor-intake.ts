// Live LLM smoke for advisor-mode intake (Q6 priority + Q7 career goal).
// Drives runDebbieIntakeTurn({ advisorMode: true }) through a synthetic
// Q1→consent conversation and asserts Debbie reaches the two advisor
// follow-ups and captures them. Costs a handful of small Haiku calls.
//
//   npx tsx scripts/_smoke-advisor-intake.ts
//
// Exit 0 = all asserts passed, 1 = a failure.

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import {
  runDebbieIntakeTurn,
  mergeExtracted,
  EMPTY_FIELDS,
} from "../src/lib/debbie/intake-turn";
import type {
  DebbieIntakeFields,
  DebbieIntakeMessage,
  DebbieIntakeState,
} from "../src/lib/debbie/intake-types";

// What the synthetic driver says at each state. Keyed by the state we're
// answering FROM. A 6-month, clean, home-weekly driver who ranks home
// time first and wants to get into hazmat.
const ANSWERS: Record<string, string> = {
  Q1_zip: "30303",
  Q2_experience: "about 6 months, all reefer",
  Q3_schedule: "home weekly is what I'm after",
  Q4_termination: "no, I left my last job on my own terms",
  Q4_termination_probe: "nothing bad, just wanted better miles",
  Q5_sap: "never been in SAP, no positive tests ever",
  Q6_priority: "home time matters most to me, then the pay",
  Q7_career: "I'm trying to get into hazmat down the road",
  confirmation: "yep, that all sounds right",
};

async function main() {
  let state: DebbieIntakeState = "Q1_zip";
  let fields: DebbieIntakeFields = { ...EMPTY_FIELDS };
  const conversation: DebbieIntakeMessage[] = [
    { role: "assistant", content: "Hey — to start, what's your home zip?" },
    { role: "user", content: ANSWERS.Q1_zip },
  ];

  const visited = new Set<DebbieIntakeState>([state]);
  let steps = 0;

  while (state !== "consent_ready" && steps < 14) {
    steps += 1;
    const result = await runDebbieIntakeTurn({
      state,
      conversation,
      fields,
      advisorMode: true,
    });
    fields = mergeExtracted(fields, result.extracted);
    console.log(
      `\n[${state} → ${result.nextState}]\n  Debbie: ${result.assistantMessage}\n  extracted: ${JSON.stringify(result.extracted)}`,
    );

    state = result.nextState;
    visited.add(state);
    if (state === "consent_ready") break;

    // Append Debbie's question + the synthetic driver's answer for the
    // state we're now in.
    conversation.push({ role: "assistant", content: result.assistantMessage });
    const answer = ANSWERS[state] ?? "ok";
    conversation.push({ role: "user", content: answer });
  }

  // ── Assertions ────────────────────────────────────────────────────
  const checks: Array<[string, boolean]> = [
    ["reached consent_ready", state === "consent_ready"],
    ["asked Q6 priority", visited.has("Q6_priority")],
    ["asked Q7 career", visited.has("Q7_career")],
    [
      "captured priority_ranking with home_time first",
      Array.isArray(fields.priorityRanking) &&
        fields.priorityRanking[0] === "home_time",
    ],
    [
      "captured career goal (endorsement: hazmat)",
      fields.careerGoalType === "endorsement",
    ],
    ["captured the 5 core fields", fields.homeZip === "30303" && fields.sapStatus != null],
  ];

  console.log("\n──────── RESULTS ────────");
  console.log("final fields:", JSON.stringify(fields, null, 2));
  let allPass = true;
  for (const [name, ok] of checks) {
    console.log(`  ${ok ? "✓" : "✗"} ${name}`);
    if (!ok) allPass = false;
  }
  console.log(allPass ? "\nPASS — advisor intake flow works." : "\nFAIL");
  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error("smoke crashed:", err);
  process.exit(1);
});
