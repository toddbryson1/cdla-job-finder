// Thin zip → state lookup for the Debbie intake client. The client
// needs a 2-letter cdlState to construct the /api/intake POST; we
// could derive it server-side in the POST itself, but the intake-
// schema currently requires cdlState as a top-level field, so the
// client supplies it. This endpoint just reads the zipCodes table.
//
// Public, GET — same anonymity posture as /api/debbie/intake.

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { zipCodes } from "@/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const zip = url.searchParams.get("zip")?.trim() ?? "";
  if (!/^\d{5}$/.test(zip)) {
    return NextResponse.json(
      { error: "Use a 5-digit zip" },
      { status: 400 },
    );
  }
  const row = await db.query.zipCodes.findFirst({
    where: eq(zipCodes.zip, zip),
  });
  if (!row) {
    return NextResponse.json({ error: "Unknown zip" }, { status: 404 });
  }
  return NextResponse.json({
    state: row.state,
    city: row.city,
  });
}
