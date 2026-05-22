import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { drivers, zipCodes } from "@/db/schema";
import { matchDriver } from "@/lib/matching";

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
    return NextResponse.json(result);
  } catch (err) {
    console.error("[match] engine failed:", err);
    return NextResponse.json(
      { error: "Matching engine failed; see server logs" },
      { status: 500 },
    );
  }
}
