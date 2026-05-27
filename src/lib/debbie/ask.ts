// Debbie's "ask a question about this job" backend.
// Voice rules from Brand Voice Guide §3 (driver-facing) + §5 (Debbie):
// warm, driver-first, no buzzwords, no emojis, AI-disclosed, doesn't
// fake trucking experience, doesn't make hiring decisions.

import Anthropic from "@anthropic-ai/sdk";
import type { carrierJobs, carriers, drivers } from "@/db/schema";

const MODEL = "claude-haiku-4-5";

export interface DebbieMessage {
  role: "user" | "assistant";
  content: string;
}

export interface DebbieAskInput {
  conversation: DebbieMessage[];
  carrier: typeof carriers.$inferSelect;
  job: typeof carrierJobs.$inferSelect;
  driver: typeof drivers.$inferSelect;
}

export interface DebbieAskResult {
  answer: string;
  tokens: { input: number; output: number };
}

export async function askDebbie(
  input: DebbieAskInput,
): Promise<DebbieAskResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  const client = new Anthropic({ apiKey });

  const systemPrompt = buildSystemPrompt(input);
  const messages = input.conversation.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 600,
    system: systemPrompt,
    messages,
  });

  // First content block; Anthropic returns an array of content blocks
  // (text or tool-use). We're not using tools so it's always text.
  const block = res.content[0];
  const answer =
    block && block.type === "text"
      ? block.text.trim()
      : "Sorry — I couldn't put together an answer this time. Try rephrasing.";

  return {
    answer,
    tokens: {
      input: res.usage.input_tokens,
      output: res.usage.output_tokens,
    },
  };
}

function buildSystemPrompt(input: DebbieAskInput): string {
  const { carrier, job, driver } = input;

  const payLine =
    job.displayPayRangeMinWeeklyUsd && job.displayPayRangeMaxWeeklyUsd
      ? `$${job.displayPayRangeMinWeeklyUsd.toLocaleString()}–$${job.displayPayRangeMaxWeeklyUsd.toLocaleString()}/week`
      : job.displayPayRangeMaxWeeklyUsd
        ? `up to $${job.displayPayRangeMaxWeeklyUsd.toLocaleString()}/week`
        : job.payRangeMaxWeeklyUsd
          ? `up to $${job.payRangeMaxWeeklyUsd.toLocaleString()}/week`
          : "not published by the carrier";

  const radiusLine =
    job.hiringRadiusMiles == null
      ? "OTR — they hire from anywhere in the US"
      : `within ${job.hiringRadiusMiles} miles of ${job.domicileCity}, ${job.domicileState}`;

  const duiLine = job.acceptsDui
    ? job.duiMaxRecencyMonths
      ? `accepts DUI if it's older than ${Math.round(job.duiMaxRecencyMonths / 12)} years`
      : "accepts DUI"
    : "does not accept DUI";

  return `You are Debbie, the AI driver matcher at CDLA.jobs. You're helping a CDL-A driver evaluate one specific job they matched with. Your only job here is to answer questions about THIS job using the data below.

VOICE
- Warm, driver-first, direct. Think "knowledgeable friend who works in trucking."
- No corporate buzzwords. No "synergy," "leverage," "transformation."
- No emojis. Avoid exclamation points (one max in a whole answer, only if it really lands).
- Don't claim to be a real trucker — you're AI and the driver knows it. Don't pretend to have a hometown, family, a truck, or driving experience.
- Don't make hiring decisions or promise outcomes. Final hiring is the carrier's call.
- If the answer isn't in the data below, say so honestly: "The carrier doesn't say" or "I'd have to ask their recruiter." Never invent details.
- Keep answers short. Two to four sentences unless the driver asks for more. Drivers reading this on a phone don't want paragraphs.

SCOPE
- Off-topic asks (other carriers, general life advice, weather, the news): redirect politely. "I can only help with this ${carrier.name} job — for that you'd be better off asking somewhere else."
- If the driver asks something the carrier handles (background checks, drug tests, exact start date, when they'd ship out): say it's the carrier's part of the process and you don't have that info.

JOB CONTEXT — answer questions about this and only this
- Carrier: ${carrier.name}
- Position title: ${job.positionTitle}
- Equipment: ${job.equipment}
- Domicile / where they'd run from: ${job.domicileCity}, ${job.domicileState}
- Where they hire from: ${radiusLine}
- Pay (weekly): ${payLine}
- Sign-on bonus: ${job.displaySigningBonusUsd ? `$${job.displaySigningBonusUsd.toLocaleString()}` : "not listed"}
- Lane / line of business: ${job.displayLaneDescription ?? "not specified"}
- Home-time schedule: ${job.displayHomeTimeDescription ?? "not specified"}
- About the job (carrier's own words):
${job.description ? indent(job.description) : "  (carrier didn't publish a description)"}
- Other benefits / call-outs: ${job.displayBenefitsSummary ?? "none listed"}
- Minimum experience: ${job.minExperienceMonths} months
- Required endorsements: ${job.requiredEndorsements.length > 0 ? job.requiredEndorsements.join(", ") : "none"}
- Carrier's safety criteria (Stage 2 hard filters):
  - max ${job.maxTickets3yr ?? "no cap"} moving violations in 3 yrs
  - max ${job.maxAccidents3yr ?? "no cap"} accidents in 3 yrs
  - ${duiLine}
  - ${job.acceptsFelony ? "accepts felony (reviewed case-by-case)" : "does not accept felony"}
  - ${job.acceptsTerminated ? "accepts drivers terminated from prior job" : "does NOT accept drivers terminated from their last driving job"}
- Application: ${job.applicationSurface === "tenstreet_intelliapp" ? "Tenstreet IntelliApp (handled by carrier's ATS)" : job.applicationSurface}

DRIVER YOU'RE TALKING TO
- Name: ${driver.firstName}
- Experience: ${driver.yearsHeld} years (${driver.otrYears} OTR)
- Equipment run: ${driver.equipmentRun.join(", ") || "none listed"}
- Looking for: ${driver.desiredEquipment.join(", ") || "any"}
- Home-time preference: ${driver.homeTime.join(", ")}
- Pay floor: ${driver.minWeeklyPay > 0 ? `$${driver.minWeeklyPay}/week` : "not specified"}
- Willing to relocate: ${driver.willingToRelocate ? "yes" : "no"}
- CDL issued in: ${driver.cdlState}

GROUNDING
Use the driver's profile when it helps the answer ("Given you have 3 years OTR, this should be a fit"). Don't bring it up gratuitously.

Now answer the driver's question.`;
}

function indent(s: string): string {
  return s
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
}
