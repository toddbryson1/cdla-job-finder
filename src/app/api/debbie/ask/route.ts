import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { carrierJobs, carriers, drivers } from "@/db/schema";
import { getSessionState } from "@/lib/stytch/session";
import { askDebbie, type DebbieMessage } from "@/lib/debbie/ask";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Drivers ask Debbie questions about a specific matched job. Auth via
// the Stytch session — only signed-in drivers can use this, and the
// driver_id must match the session's email (same identity check the
// matches page does).
//
// Conversation history is sent client-side and forwarded to Claude on
// each request. We don't persist conversations server-side for v1.

const MAX_TURNS = 10;
const MAX_QUESTION_CHARS = 800;

const askSchema = z.object({
  driverId: z.string().uuid(),
  jobId: z.string().uuid(),
  conversation: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(MAX_QUESTION_CHARS),
      }),
    )
    .min(1)
    .max(MAX_TURNS * 2),
});

export async function POST(request: Request) {
  // Auth
  const session = await getSessionState();
  if (session.kind !== "ok") {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = askSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        issues: parsed.error.issues.map((i) => i.message),
      },
      { status: 400 },
    );
  }
  const { driverId, jobId, conversation } = parsed.data;

  // Load driver and verify it matches the session email
  const driver = await db.query.drivers.findFirst({
    where: eq(drivers.id, driverId),
  });
  if (!driver || !driver.email || driver.email.toLowerCase() !== session.email) {
    return NextResponse.json({ error: "Not your driver" }, { status: 403 });
  }

  // Load job + carrier
  const job = await db.query.carrierJobs.findFirst({
    where: eq(carrierJobs.id, jobId),
  });
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  const carrier = await db.query.carriers.findFirst({
    where: eq(carriers.id, job.carrierId),
  });
  if (!carrier) {
    return NextResponse.json({ error: "Carrier not found" }, { status: 404 });
  }

  // The conversation must end with a user message. The frontend sends
  // the new question as the last message; Debbie's reply is appended
  // client-side from our response.
  const last = conversation[conversation.length - 1];
  if (last.role !== "user") {
    return NextResponse.json(
      { error: "Last message must be from user" },
      { status: 400 },
    );
  }

  try {
    const result = await askDebbie({
      conversation: conversation as DebbieMessage[],
      carrier,
      job,
      driver,
    });
    console.log(
      `[debbie/ask] driver=${driverId} job=${jobId} tokens_in=${result.tokens.input} tokens_out=${result.tokens.output}`,
    );
    return NextResponse.json({ answer: result.answer });
  } catch (err) {
    console.error("[debbie/ask] failed:", err);
    return NextResponse.json(
      {
        error:
          "Debbie hit a snag answering that. Try rephrasing, or ask again in a minute.",
      },
      { status: 502 },
    );
  }
}
