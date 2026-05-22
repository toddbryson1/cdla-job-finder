import { NextResponse } from "next/server";
import { intakeSchema } from "@/lib/intake-schema";
import { db } from "@/db/client";
import { drivers } from "@/db/schema";

export const runtime = "nodejs";

function tryParseDuiDate(input: string): string | null {
  // Intake currently captures DUI date as free text ("March 2019"). Stage 2
  // will collect a structured date. Try a permissive parse here so we can
  // populate the nullable `dui_most_recent_date` column when the user gave a
  // recognizable date; otherwise leave it null.
  if (!input || !input.trim()) return null;
  const d = new Date(input.trim());
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = intakeSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
      },
      { status: 400 },
    );
  }

  const d = parsed.data;

  // Intake doesn't capture home_zip yet (separate session). Leave home_zip/
  // home_lat/home_lng null on the driver row; /api/match will return 422
  // until they're populated.

  try {
    const [row] = await db
      .insert(drivers)
      .values({
        firstName: d.firstName,
        lastName: d.lastName,
        email: d.email,
        phone: d.phone,
        cdlState: d.cdlState,
        yearsHeld: d.yearsHeld,
        equipmentRun: d.equipmentRun,
        endorsements: d.endorsements,
        otrYears: d.otrYears,
        desiredEquipment: d.desiredEquipment,
        desiredRegions: d.desiredRegions,
        homeTime: d.homeTime,
        minWeeklyPay: d.minWeeklyPay,
        willingToRelocate: d.willingToRelocate,
        accidents3yrCount: d.accidents3yrCount,
        accidentsDetails: d.accidentsDetails,
        tickets3yrCount: d.tickets3yrCount,
        duiEver: d.duiEver,
        duiMostRecentDate: tryParseDuiDate(d.duiMostRecentDate),
        felonyEver: d.felonyEver,
        felonyDetails: d.felonyDetails,
        terminatedFromAnyOfLast3Employers: d.terminatedFromAnyOfLast3Employers,
        failedDotTest: d.failedDotTest,
        sapStatus: d.sapStatus,
        attestAccurate: d.attestAccurate,
        consentToShare: d.consentToShare,
        smsOptIn: d.smsOptIn,
      })
      .returning({ id: drivers.id });

    console.log(
      `[intake] driver ${row?.id} ${d.firstName} ${d.lastName} <${d.email}> wants ${d.desiredEquipment.join(",")} in ${d.desiredRegions.join(",")} (home: ${d.homeTime})`,
    );

    return NextResponse.json({ ok: true, driverId: row?.id });
  } catch (err) {
    console.error("[intake] insert failed:", err);
    return NextResponse.json(
      { error: "Couldn't save your intake. Try again in a minute." },
      { status: 500 },
    );
  }
}
