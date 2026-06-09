import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { drivers, zipCodes } from "@/db/schema";
import { matchDriver } from "@/lib/matching";
import { loadDisplayExtras } from "@/lib/match-display-data";
import {
  descriptionSnippet,
  buildAdvisorChatPreamble,
} from "@/lib/debbie/match-render";
import { isAdvisorModeEnabled } from "@/lib/advisor/flags";
import { assessDriver } from "@/lib/advisor/assessment";
import {
  buildRankedRecommendation,
  reasonLine,
} from "@/lib/advisor/ranked-recommendation";

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

    // Advisor block (flag-gated). When on, the chat speaks an honest
    // assessment + a ranked top pick instead of the flat count preamble.
    // Off → omitted entirely and the chat falls back to its neutral copy.
    let advisor: {
      preamble: string;
      strengths: string[];
      weaknesses: Array<{ label: string; pathForward: string }>;
    } | null = null;
    if (isAdvisorModeEnabled()) {
      const assessment = assessDriver({
        experienceMonths: Math.round(Number(driver.yearsHeld) * 12),
        endorsements: driver.endorsements,
        terminated: driver.terminatedFromAnyOfLast3Employers,
        sapStatus: driver.sapStatus,
        accidents3yrAtFaultCount: driver.accidents3yrAtFaultCount,
        tickets3yrCount: driver.tickets3yrCount,
        duiEver: driver.duiEver,
        felonyEver: driver.felonyEver,
      });
      const { top } = buildRankedRecommendation(result.matches);
      advisor = {
        preamble: buildAdvisorChatPreamble(
          result.matches.length,
          null,
          driver.cdlState,
          {
            topStrength: assessment.strengths[0]?.label ?? null,
            topPickName: top?.carrierName ?? null,
            topPickReason: top ? reasonLine(top) : null,
          },
        ),
        strengths: assessment.strengths.map((s) => s.label),
        weaknesses: assessment.weaknesses,
      };
    }

    return NextResponse.json({ ...result, matches: enrichedMatches, advisor });
  } catch (err) {
    console.error("[match] engine failed:", err);
    return NextResponse.json(
      { error: "Matching engine failed; see server logs" },
      { status: 500 },
    );
  }
}
