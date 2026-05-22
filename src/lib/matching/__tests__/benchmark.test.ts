import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { matchDriver } from "@/lib/matching";
import { clearDrivers, insertTestDriver } from "./testHelpers";

const ATLANTA = { lat: "33.749000", lng: "-84.388000" };
const ITERATIONS = 100;

beforeAll(async () => {
  await clearDrivers();
});

afterAll(async () => {
  await clearDrivers();
});

describe("matchDriver benchmark", () => {
  it(`runs ${ITERATIONS} times with median under 300ms`, async () => {
    const id = await insertTestDriver({
      homeLat: ATLANTA.lat,
      homeLng: ATLANTA.lng,
      cdlState: "GA",
      desiredEquipment: ["reefer", "dry-van", "flatbed"],
      yearsHeld: 5,
      willingToRelocate: true,
      homeTime: "otr",
    });
    // Warm-up
    await matchDriver(id);

    const times: number[] = [];
    for (let i = 0; i < ITERATIONS; i += 1) {
      const t0 = performance.now();
      await matchDriver(id);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const median = times[Math.floor(times.length / 2)];
    const p95 = times[Math.floor(times.length * 0.95)];
    // Log so we can see actuals
    console.log(
      `benchmark: median=${median.toFixed(1)}ms p95=${p95.toFixed(1)}ms min=${times[0].toFixed(1)}ms max=${times[times.length - 1].toFixed(1)}ms`,
    );
    expect(median).toBeLessThan(300);
  });
});
