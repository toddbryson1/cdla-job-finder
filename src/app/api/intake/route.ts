import { NextResponse } from "next/server";
import { intakeSchema } from "@/lib/intake-schema";
import { db } from "@/db/client";
import { drivers } from "@/db/schema";

export const runtime = "nodejs";

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
        openToRelocation: d.openToRelocation,
        accidentsLast3Years: d.accidentsLast3Years,
        accidentsDetails: d.accidentsDetails,
        violationsLast3Years: d.violationsLast3Years,
        duiEver: d.duiEver,
        duiMostRecentDate: d.duiMostRecentDate,
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
      `[intake] driver #${row?.id} ${d.firstName} ${d.lastName} <${d.email}> wants ${d.desiredEquipment.join(",")} in ${d.desiredRegions.join(",")} (home: ${d.homeTime})`,
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
