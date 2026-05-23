import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { carrierJobs, carriers, drivers } from "@/db/schema";

export interface DriverFixture {
  homeZip?: string | null;
  homeLat: string;
  homeLng: string;
  cdlState?: string;
  yearsHeld?: number;
  otrYears?: number;
  equipmentRun?: string[];
  desiredEquipment?: string[];
  desiredRegions?: string[];
  endorsements?: string[];
  homeTime?: Array<"daily" | "weekly" | "biweekly" | "otr">;
  minWeeklyPay?: number;
  willingToRelocate?: boolean;
  terminated?: boolean;
  failedDot?: boolean;
  sapStatus?: "not-in-sap" | "in-sap" | "completed-sap";
}

let driverCounter = 0;

export async function insertTestDriver(fx: DriverFixture): Promise<string> {
  driverCounter += 1;
  const [row] = await db
    .insert(drivers)
    .values({
      firstName: "Test",
      lastName: `Driver${driverCounter}`,
      email: `test${driverCounter}+${Date.now()}@example.com`,
      phone: "555-555-1234",
      cdlState: fx.cdlState ?? "GA",
      yearsHeld: fx.yearsHeld ?? 5,
      otrYears: fx.otrYears ?? 0,
      equipmentRun: fx.equipmentRun ?? ["dry-van"],
      endorsements: fx.endorsements ?? [],
      desiredEquipment: fx.desiredEquipment ?? ["dry-van"],
      desiredRegions: fx.desiredRegions ?? ["any"],
      homeTime: fx.homeTime ?? ["weekly"],
      minWeeklyPay: fx.minWeeklyPay ?? 0,
      willingToRelocate: fx.willingToRelocate ?? false,
      homeZip: fx.homeZip ?? null,
      homeLat: fx.homeLat,
      homeLng: fx.homeLng,
      terminatedFromAnyOfLast3Employers: fx.terminated ?? false,
      failedDotTest: fx.failedDot ?? false,
      sapStatus: fx.sapStatus ?? "not-in-sap",
      attestAccurate: true,
      consentToShare: true,
    })
    .returning({ id: drivers.id });

  if (!row) throw new Error("Failed to insert test driver");
  return row.id;
}

export async function clearDrivers(): Promise<void> {
  await db.execute(sql`TRUNCATE TABLE drivers RESTART IDENTITY CASCADE`);
}

export async function getCarrierIdByName(name: string): Promise<string> {
  const carrier = await db.query.carriers.findFirst({
    where: (c, { eq }) => eq(c.name, name),
  });
  if (!carrier) throw new Error(`Carrier "${name}" not found`);
  return carrier.id;
}

export async function insertPermissiveJobsInAtlanta(count: number, carrierId: string) {
  const values = [] as Parameters<typeof db.insert>[0] extends never
    ? never
    : Array<typeof carrierJobs.$inferInsert>;
  for (let i = 0; i < count; i += 1) {
    values.push({
      carrierId,
      status: "active",
      positionTitle: `Permissive Atlanta Reefer #${i}`,
      domicileCity: "Atlanta",
      domicileState: "GA",
      domicileLat: "33.749000",
      domicileLng: "-84.388000",
      hiringRadiusMiles: 100,
      equipment: "reefer",
      minExperienceMonths: 0,
      acceptedHomeTimeTypes: ["weekly", "biweekly", "otr"],
      payRangeMaxWeeklyUsd: 1800,
      displayPayRangeMinWeeklyUsd: 1200,
      displayPayRangeMaxWeeklyUsd: 1800,
      sapTolerance: "accepts_all",
      preferredEquipmentExperience: ["reefer"],
      preferredRegions: ["southeast"],
      applicationSurface: "tenstreet_intelliapp",
      applicationUrl: `https://example.com/apply/${i}`,
      dataSource: "manual_partner_intake",
      verificationStatus: "verified",
      dataQuality: "complete",
      lastVerifiedAt: new Date(),
    });
  }
  await db.insert(carrierJobs).values(values);
}

export async function deletePermissiveJobsByTitle() {
  await db.execute(
    sql`DELETE FROM carrier_jobs WHERE position_title LIKE 'Permissive Atlanta Reefer %'`,
  );
}

export { db, carriers, carrierJobs };
