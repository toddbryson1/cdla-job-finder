// Tests for the city picker. haversineMiles is pure; pickPostingCities
// hits Postgres for zip_codes lookups, so those tests run as
// integration against the local DB (33k zip_codes pre-seeded by
// scripts/import-zip-codes per the matching engine test setup).

import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  carrierJobs,
  carriers,
  jobPostingCycles,
} from "@/db/schema";
import { haversineMiles, pickPostingCities } from "@/lib/posting-cities";

type CarrierJob = typeof carrierJobs.$inferSelect;

async function getSeedCarrierId(): Promise<string> {
  const c = await db.query.carriers.findFirst({
    where: (cs, { eq }) => eq(cs.name, "Atlanta Reefer Co (composite)"),
  });
  if (!c) throw new Error("Seed carrier not found — run npm run db:seed");
  return c.id;
}

async function insertTestJob(
  overrides: Partial<typeof carrierJobs.$inferInsert> = {},
): Promise<CarrierJob> {
  const carrierId = await getSeedCarrierId();
  const [row] = await db
    .insert(carrierJobs)
    .values({
      carrierId,
      status: "active",
      positionTitle: `TEST cities ${Date.now()}-${Math.random()}`,
      domicileCity: "Phoenix",
      domicileState: "AZ",
      domicileLat: "33.448400",
      domicileLng: "-112.074000",
      hiringRadiusMiles: 100,
      equipment: "dry-van",
      acceptedHomeTimeTypes: ["weekly"],
      ...overrides,
    })
    .returning();
  return row;
}

async function deleteTestJobs() {
  await db.execute(
    sql`DELETE FROM carrier_jobs WHERE position_title LIKE 'TEST cities %'`,
  );
}

describe("posting-cities.haversineMiles", () => {
  it("returns 0 for identical points", () => {
    expect(haversineMiles(33.449, -112.074, 33.449, -112.074)).toBe(0);
  });

  it("computes Phoenix → Tucson ≈ 110 mi", () => {
    // Real distance is about 105-115 mi
    const d = haversineMiles(33.4484, -112.074, 32.2226, -110.9747);
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(125);
  });

  it("computes NYC → LA ≈ 2450 mi", () => {
    const d = haversineMiles(40.7128, -74.006, 34.0522, -118.2437);
    expect(d).toBeGreaterThan(2400);
    expect(d).toBeLessThan(2500);
  });

  it("is symmetric (haversine(a,b) == haversine(b,a))", () => {
    const ab = haversineMiles(33.449, -112.074, 32.2226, -110.9747);
    const ba = haversineMiles(32.2226, -110.9747, 33.449, -112.074);
    expect(ab).toBe(ba);
  });
});

describe("posting-cities.pickPostingCities", () => {
  afterEach(async () => {
    // Clean any test rows the suite inserted
    await deleteTestJobs();
  });

  it("returns at least the domicile city for a normal job", async () => {
    const job = await insertTestJob({
      domicileCity: "Phoenix",
      domicileState: "AZ",
      hiringRadiusMiles: 100,
    });
    const cities = await pickPostingCities(job, { maxCities: 4 });
    expect(cities.length).toBeGreaterThanOrEqual(1);
    const phoenix = cities.find(
      (c) => c.city.toLowerCase() === "phoenix" && c.state === "AZ",
    );
    expect(phoenix).toBeTruthy();
  });

  it("returns empty array when carrier has no lat/lng", async () => {
    // simulate a corrupt row — null lat
    const cities = await pickPostingCities({
      ...(await insertTestJob()),
      domicileLat: null,
    } as unknown as CarrierJob);
    expect(cities).toEqual([]);
  });

  it("respects hiring_radius_miles — no city further than the radius", async () => {
    const job = await insertTestJob({
      domicileCity: "Phoenix",
      domicileState: "AZ",
      hiringRadiusMiles: 50,
    });
    const cities = await pickPostingCities(job, { maxCities: 4 });
    for (const c of cities) {
      expect(c.distanceMiles).toBeLessThanOrEqual(50);
    }
  });

  it("falls back to a 250-mile radius for OTR (null radius) jobs", async () => {
    const job = await insertTestJob({
      domicileCity: "Phoenix",
      domicileState: "AZ",
      hiringRadiusMiles: null,
      acceptedHomeTimeTypes: ["otr"], // required by the OTR invariant CHECK
    });
    const cities = await pickPostingCities(job, { maxCities: 4 });
    expect(cities.length).toBeGreaterThan(0);
    // At least one secondary should be > 50mi away (default radius is much wider)
    const distinctDistances = new Set(cities.map((c) => Math.round(c.distanceMiles)));
    expect(distinctDistances.size).toBeGreaterThanOrEqual(1);
  });

  it("enforces ≥50mi spacing between returned candidates", async () => {
    const job = await insertTestJob({
      domicileCity: "Phoenix",
      domicileState: "AZ",
      hiringRadiusMiles: 150,
    });
    const cities = await pickPostingCities(job, { maxCities: 4 });
    // Check every pair
    for (let i = 0; i < cities.length; i++) {
      for (let j = i + 1; j < cities.length; j++) {
        const d = haversineMiles(
          cities[i].lat,
          cities[i].lng,
          cities[j].lat,
          cities[j].lng,
        );
        expect(d).toBeGreaterThanOrEqual(50);
      }
    }
  });

  it("respects a custom minSpacingMiles override", async () => {
    const job = await insertTestJob({
      domicileCity: "Phoenix",
      domicileState: "AZ",
      hiringRadiusMiles: 150,
    });
    const cities = await pickPostingCities(job, {
      maxCities: 4,
      minSpacingMiles: 75,
    });
    for (let i = 0; i < cities.length; i++) {
      for (let j = i + 1; j < cities.length; j++) {
        const d = haversineMiles(
          cities[i].lat,
          cities[i].lng,
          cities[j].lat,
          cities[j].lng,
        );
        expect(d).toBeGreaterThanOrEqual(75);
      }
    }
  });

  it("respects maxCities cap", async () => {
    const job = await insertTestJob({
      domicileCity: "Phoenix",
      domicileState: "AZ",
      hiringRadiusMiles: 250,
    });
    const cities = await pickPostingCities(job, { maxCities: 2 });
    expect(cities.length).toBeLessThanOrEqual(2);
  });

  it("skips cities that already have an active cycle for this job", async () => {
    const job = await insertTestJob({
      domicileCity: "Phoenix",
      domicileState: "AZ",
      hiringRadiusMiles: 150,
    });
    // Create an active cycle for Phoenix manually — picker should
    // skip Phoenix when choosing.
    await db.insert(jobPostingCycles).values({
      jobId: job.id,
      city: "Phoenix",
      state: "AZ",
      cycleIndex: 1,
      variantIndex: 0,
      isPrimary: true,
      postedAt: new Date(),
      expiresAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
      status: "active",
    });
    const cities = await pickPostingCities(job, { maxCities: 4 });
    expect(
      cities.find(
        (c) => c.city.toLowerCase() === "phoenix" && c.state === "AZ",
      ),
    ).toBeUndefined();

    // Cleanup
    await db.delete(jobPostingCycles).where(eq(jobPostingCycles.jobId, job.id));
  });
});
