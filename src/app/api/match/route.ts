import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { drivers, zipCodes } from "@/db/schema";
import { matchDriver } from "@/lib/matching";
import { loadDisplayExtras } from "@/lib/match-display-data";
import { descriptionSnippet } from "@/lib/debbie/match-render";

export const runtime = "nodejs";

interface MatchRequestBody {
  driverId?: string;
}

export async function POST(request: Request) {
  let body: MatchRequestBody;
  try {
    body = (await request.json()) as MatchRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const driverId = body.driverId;
  if (!driverId || typeof driverId !== "string") {
    return NextResponse.json(
      { error: "driverId is required (string UUID)" },
      { status: 400 },
    );
  }

  const driver = await db.query.drivers.findFirst({
    where: eq(drivers.id, driverId),
  });

  if (!driver) {
    return NextResponse.json({ error: "Driver not found" }, { status: 404 });
  }
  // CCPA deletion defense: treat a deleted row exactly like
  // not-found so the matching engine never operates on PII-stripped
  // profile data. (matchDriver itself also gates, but failing here
  // gives the caller a clean 404 instead of a 500 from the engine.)
  if (driver.deletedAt != null) {
    return NextResponse.json({ error: "Driver not found" }, { status: 404 });
  }

  if (!driver.homeZip) {
    return NextResponse.json(
      { error: "Driver has no home_zip; cannot match without a home location" },
      { status: 422 },
    );
  }

  if (driver.homeLat == null || driver.homeLng == null) {
    const zip = await db.query.zipCodes.findFirst({
      where: eq(zipCodes.zip, driver.homeZip),
    });
    if (!zip) {
      return NextResponse.json(
        {
          error: `home_zip ${driver.homeZip} not found in zip_codes table; cannot geocode`,
        },
        { status: 422 },
      );
    }
    await db
      .update(drivers)
      .set({ homeLat: zip.lat, homeLng: zip.lng })
      .where(eq(drivers.id, driverId));
  }

  try {
    const result = await matchDriver(driverId);

    // Enrich the matches with a short description snippet for the
    // Debbie chat MatchCard. The matching engine intentionally keeps
    // its Match type focused on rank/qualifier fields — descriptions
    // come from carrierJobs.description via loadDisplayExtras, which
    // also feeds the full /match/[driverId] page.
    //
    // Snippet is capped at ~180 chars at a sentence boundary so the
    // chat card stays compact; the full description shows on the
    // apply page.
    const jobIds = result.matches.map((m) => m.jobId);
    const extras = await loadDisplayExtras(jobIds);

    const enrichedMatches = result.matches.map((m) => ({
      ...m,
      // Prefer the composed displayDescription (description with
      // displayLane/HomeTime/Benefits fallback) over the raw column —
      // catches the API-sourced carriers (Swift / USX / PAM) whose
      // long-form description is null but whose structured display
      // fields ARE populated.
      descriptionSnippet: descriptionSnippet(
        extras.get(m.jobId)?.displayDescription ?? null,
      ),
    }));

    return NextResponse.json({ ...result, matches: enrichedMatches });
  } catch (err) {
    console.error("[match] engine failed:", err);
    return NextResponse.json(
      { error: "Matching engine failed; see server logs" },
      { status: 500 },
    );
  }
}
