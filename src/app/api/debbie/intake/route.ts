// Debbie's Stage 1 intake conversation endpoint. One POST per driver
// message: the client sends the running conversation + current state +
// fields gathered so far, the server runs one LLM turn, and returns
// what Debbie says next plus the extracted fields.
//
// Stateless server-side — the client owns the canonical conversation
// state. That keeps the route cheap (no DB writes for in-flight chats)
// and lets the driver bounce / reload without losing context (the
// client persists to sessionStorage). Final state lands in the
// drivers table only after Stage 1 consent + a call to /api/intake.
//
// Public route — no auth. Stage 1 intake is anonymous by design.
// Anti-abuse is just the LLM rate limit + Vercel platform limits for
// v1; in a future commit we should add IP rate limiting if traffic
// shape demands it.

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  EMPTY_FIELDS,
  mergeExtracted,
  runDebbieIntakeTurn,
  type DebbieIntakeFields,
  type DebbieIntakeMessage,
  type DebbieIntakeState,
} from "@/lib/debbie/intake-turn";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_TURNS = 30; // 15 user + 15 assistant
const MAX_CONTENT_CHARS = 600;

const stateEnum = z.enum([
  "Q1_zip",
  "Q2_experience",
  "Q3_schedule",
  "Q4_termination",
  "Q4_termination_probe",
  "Q5_sap",
  "confirmation",
  "consent_ready",
]);

const fieldsSchema = z.object({
  homeZip: z.string().regex(/^\d{5}$/).nullable(),
  experienceYears: z.number().min(0).max(60).nullable(),
  schedule: z.enum(["local", "regional", "otr", "any"]).nullable(),
  terminatedLastJob: z.boolean().nullable(),
  terminationReason: z.string().max(2000).nullable(),
  sapStatus: z.enum(["not-in-sap", "in-sap", "completed-sap"]).nullable(),
});

const requestSchema = z.object({
  state: stateEnum,
  conversation: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(MAX_CONTENT_CHARS),
      }),
    )
    .min(1)
    .max(MAX_TURNS),
  fields: fieldsSchema.optional().default(EMPTY_FIELDS),
});

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        issues: parsed.error.issues.map((i) => i.message),
      },
      { status: 400 },
    );
  }
  const { state, conversation, fields } = parsed.data;

  const last = conversation[conversation.length - 1];
  if (last.role !== "user") {
    return NextResponse.json(
      { error: "Last message must be from user" },
      { status: 400 },
    );
  }

  try {
    const result = await runDebbieIntakeTurn({
      state,
      conversation: conversation as DebbieIntakeMessage[],
      fields: fields as DebbieIntakeFields,
    });

    const updatedFields = mergeExtracted(
      fields as DebbieIntakeFields,
      result.extracted,
    );

    console.log(
      `[debbie/intake] state=${state}→${result.nextState} extracted=${Object.keys(result.extracted).join(",") || "(none)"} tokens=${result.tokens.input}/${result.tokens.output}`,
    );

    return NextResponse.json({
      assistantMessage: result.assistantMessage,
      nextState: result.nextState,
      fields: updatedFields,
    });
  } catch (err) {
    console.error("[debbie/intake] failed:", err);
    return NextResponse.json(
      {
        error:
          "Debbie hit a snag. Try sending that again, or use the form fallback if it keeps happening.",
      },
      { status: 502 },
    );
  }
}

// Voice rules note: any error message that ends up driver-facing
// should match Debbie's tone — warm, plain, no jargon. The 502 above
// hits that bar; the 400/Validation messages above don't (intentional
// because they shouldn't render to drivers — the client validates
// before posting).
export const _voiceRulesNote =
  "Error 502 reaches drivers; 400/4xx don't (client-side validation gates them).";
