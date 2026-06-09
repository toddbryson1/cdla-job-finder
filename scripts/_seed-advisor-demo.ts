// Seeds a demo carrier(+fit-tier)+job and an advisor-profile driver into
// cdla_dev, then prints the driver id so /matches/<id> can be rendered
// with ADVISOR_MODE_ENABLED=true to eyeball the advisor UI. Rows are
// marked ADVISOR_DEMO for easy cleanup.
//
//   npx tsx scripts/_seed-advisor-demo.ts

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { sql } from "drizzle-orm";
import { db } from "../src/db/client";
import { carriers, carrierJobs, drivers } from "../src/db/schema";

const ATL_LAT = "33.749000";
const ATL_LNG = "-84.388000";

async function main() {
  // Clean any prior demo rows first (carrier delete cascades to its jobs).
  await db.execute(sql`DELETE FROM carriers WHERE name LIKE 'ADVISOR_DEMO%'`);
  await db.execute(sql`DELETE FROM drivers WHERE first_name = 'AdvisorDemo'`);

  const [c] = await db
    .insert(carriers)
    .values({
      name: "ADVISOR_DEMO Reefer Carrier",
      kind: "partner",
      tier: "none",
      status: "active",
      fitTierProfile: {
        experience: { strongMinMonths: 3, strongMaxMonths: 12, fadesAfterMonths: 24 },
      },
    })
    .returning({ id: carriers.id });

  await db.insert(carrierJobs).values({
    carrierId: c!.id,
    status: "active",
    positionTitle: "ADVISOR_DEMO Reefer — Home Weekly",
    description:
      "Regional reefer lane running the Southeast. Home most weekends. No-touch freight.",
    domicileCity: "Atlanta",
    domicileState: "GA",
    domicileLat: ATL_LAT,
    domicileLng: ATL_LNG,
    hiringRadiusMiles: 200,
    equipment: "reefer",
    minExperienceMonths: 0,
    acceptedHomeTimeTypes: ["weekly"],
    payRangeMaxWeeklyUsd: 1600,
    displayPayRangeMinWeeklyUsd: 1200,
    displayPayRangeMaxWeeklyUsd: 1600,
    sapTolerance: "accepts_all",
    preferredEquipmentExperience: ["reefer"],
    preferredRegions: ["southeast"],
    applicationSurface: "tenstreet_intelliapp",
    applicationUrl: "https://example.com/apply",
    dataSource: "manual_partner_intake",
    verificationStatus: "verified",
    dataQuality: "complete",
    lastVerifiedAt: new Date(),
  });

  const [d] = await db
    .insert(drivers)
    .values({
      firstName: "AdvisorDemo",
      lastName: "Driver",
      cdlState: "GA",
      homeZip: "30303",
      homeLat: ATL_LAT,
      homeLng: ATL_LNG,
      yearsHeld: "0.5", // 6 months → strong-fit band
      otrYears: "0",
      equipmentRun: ["reefer"],
      endorsements: [],
      desiredEquipment: ["reefer"],
      desiredRegions: ["southeast"],
      homeTime: ["weekly"],
      minWeeklyPay: 0,
      willingToRelocate: false,
      priorityRanking: ["home_time", "pay"],
      careerGoalType: "endorsement",
      careerGoalDetail: "hazmat",
      terminatedFromAnyOfLast3Employers: false,
      failedDotTest: false,
      sapStatus: "not-in-sap",
      attestAccurate: true,
      consentToShare: true,
    })
    .returning({ id: drivers.id });

  console.log("DRIVER_ID=" + d!.id);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
