import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertAggregateOnly,
  driverDemandByStateAndEquipment,
  unmetDemandByStateAndEquipment,
  topPriorityDistributionByState,
  MIN_GROUP_SIZE,
} from "@/lib/driver-demand/aggregate";
import {
  clearDrivers,
  insertTestDriver,
} from "@/lib/matching/__tests__/testHelpers";

// The aggregate/prospecting layer is the privacy firewall: a prospective
// carrier may see counts and distributions, NEVER an individual driver.
// These tests pin both halves of the guarantee — (1) no identifier ever
// rides along on a returned row, and (2) small cells are suppressed so a
// count can't narrow to one identifiable person.

const ATL_LAT = "33.749000";
const ATL_LNG = "-84.388000";

async function seedDemand() {
  await clearDrivers();
  // 6 GA reefer drivers → above MIN_GROUP_SIZE, should appear.
  for (let i = 0; i < 6; i += 1) {
    await insertTestDriver({
      homeLat: ATL_LAT,
      homeLng: ATL_LNG,
      cdlState: "GA",
      desiredEquipment: ["reefer"],
      priorityRanking: ["pay", "home_time"],
    });
  }
  // 5 TX dry-van drivers, all re-match-eligible with a no-match reason →
  // appears in both general demand and the unmet-demand recruitment list.
  for (let i = 0; i < 5; i += 1) {
    await insertTestDriver({
      homeLat: ATL_LAT,
      homeLng: ATL_LNG,
      cdlState: "TX",
      desiredEquipment: ["dry-van"],
      priorityRanking: ["home_time"],
      reMatchEligible: true,
      noMatchReason: "no dry-van carrier in region",
    });
  }
  // 2 WY hazmat drivers → BELOW MIN_GROUP_SIZE, must be suppressed.
  for (let i = 0; i < 2; i += 1) {
    await insertTestDriver({
      homeLat: ATL_LAT,
      homeLng: ATL_LNG,
      cdlState: "WY",
      desiredEquipment: ["hazmat"],
      priorityRanking: ["pay"],
    });
  }
}

describe("driver-demand aggregate layer", () => {
  beforeAll(seedDemand);
  afterAll(clearDrivers);

  it("MIN_GROUP_SIZE is at least 5 (re-identification guard)", () => {
    expect(MIN_GROUP_SIZE).toBeGreaterThanOrEqual(5);
  });

  it("returns counts by state × equipment and never an identifier", async () => {
    const cells = await driverDemandByStateAndEquipment();
    const ga = cells.find(
      (c) => c.cdlState === "GA" && c.desiredEquipment === "reefer",
    );
    expect(ga?.driverCount).toBe(6);

    // No row may carry a driver identifier or any PII.
    const forbidden = ["id", "driverId", "email", "phone", "homeZip", "firstName"];
    for (const cell of cells) {
      for (const key of Object.keys(cell)) {
        expect(forbidden).not.toContain(key);
      }
    }
  });

  it("suppresses cells below MIN_GROUP_SIZE", async () => {
    const cells = await driverDemandByStateAndEquipment();
    // The 2-driver WY/hazmat cell must NOT surface.
    const wy = cells.find(
      (c) => c.cdlState === "WY" && c.desiredEquipment === "hazmat",
    );
    expect(wy).toBeUndefined();
    // And nothing reported is ever below the threshold.
    for (const cell of cells) {
      expect(cell.driverCount).toBeGreaterThanOrEqual(MIN_GROUP_SIZE);
    }
  });

  it("unmet demand surfaces the carrier-recruitment target list", async () => {
    const cells = await unmetDemandByStateAndEquipment();
    const tx = cells.find(
      (c) => c.cdlState === "TX" && c.desiredEquipment === "dry-van",
    );
    expect(tx?.driverCount).toBe(5);
    // GA reefer drivers are NOT flagged re_match_eligible → excluded here.
    const ga = cells.find((c) => c.cdlState === "GA");
    expect(ga).toBeUndefined();
  });

  it("reports top-priority distribution by state with no identifiers", async () => {
    const cells = await topPriorityDistributionByState();
    const gaPay = cells.find(
      (c) => c.cdlState === "GA" && c.topPriority === "pay",
    );
    expect(gaPay?.driverCount).toBe(6);
    for (const cell of cells) {
      expect(cell.driverCount).toBeGreaterThanOrEqual(MIN_GROUP_SIZE);
    }
  });

  it("assertAggregateOnly throws if a forbidden identifier key is present", () => {
    expect(() =>
      assertAggregateOnly([{ cdlState: "GA", driverId: "leak", driverCount: 9 }]),
    ).toThrow(/forbidden identifier/i);
    // A clean aggregate row passes through untouched.
    const clean = [{ cdlState: "GA", desiredEquipment: "reefer", driverCount: 9 }];
    expect(assertAggregateOnly(clean)).toBe(clean);
  });
});
