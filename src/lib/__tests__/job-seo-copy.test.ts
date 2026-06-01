import { describe, expect, it } from "vitest";
import { buildPublicJobTitle, deriveLaneNoun } from "@/lib/job-seo-copy";
import type { carrierJobs } from "@/db/schema";

type Job = typeof carrierJobs.$inferSelect;

function mkJob(over: Partial<Job>): Job {
  // deriveLaneNoun only reads positionTitle, acceptedHomeTimeTypes, and
  // hiringRadiusMiles — the rest of the row shape doesn't matter here.
  return {
    positionTitle: "",
    acceptedHomeTimeTypes: null,
    hiringRadiusMiles: null,
    ...over,
  } as Job;
}

describe("buildPublicJobTitle", () => {
  it("user's spec: Regional + Kansas City", () => {
    expect(
      buildPublicJobTitle({
        laneNoun: "Regional",
        equipmentNoun: "Dry Van",
        equipmentSlug: "dry_van",
        city: "Kansas City",
        state: "MO",
      }),
    ).toBe("Regional Class A Driver in Kansas City, MO");
  });

  it("OTR + reefer + Dallas keeps the equipment", () => {
    expect(
      buildPublicJobTitle({
        laneNoun: "OTR",
        equipmentNoun: "Reefer",
        equipmentSlug: "reefer",
        city: "Dallas",
        state: "TX",
      }),
    ).toBe("OTR Class A Reefer Driver in Dallas, TX");
  });

  it("Local + tanker + Houston keeps the equipment", () => {
    expect(
      buildPublicJobTitle({
        laneNoun: "Local",
        equipmentNoun: "Tanker",
        equipmentSlug: "tanker",
        city: "Houston",
        state: "TX",
      }),
    ).toBe("Local Class A Tanker Driver in Houston, TX");
  });

  it("Regional + dry_van omits equipment (default)", () => {
    expect(
      buildPublicJobTitle({
        laneNoun: "Regional",
        equipmentNoun: "Dry Van",
        equipmentSlug: "dry_van",
        city: "Atlanta",
        state: "GA",
      }),
    ).toBe("Regional Class A Driver in Atlanta, GA");
  });

  it("dry-van slug variant (hyphen) also treated as default", () => {
    expect(
      buildPublicJobTitle({
        laneNoun: "OTR",
        equipmentNoun: "Dry Van",
        equipmentSlug: "dry-van",
        city: "Chicago",
        state: "IL",
      }),
    ).toBe("OTR Class A Driver in Chicago, IL");
  });

  it("avoids 'Local Class A Local Driver' redundancy", () => {
    expect(
      buildPublicJobTitle({
        laneNoun: "Local",
        equipmentNoun: "Local",
        equipmentSlug: "local",
        city: "Phoenix",
        state: "AZ",
      }),
    ).toBe("Local Class A Driver in Phoenix, AZ");
  });

  it("flatbed + Dedicated + Birmingham", () => {
    expect(
      buildPublicJobTitle({
        laneNoun: "Dedicated",
        equipmentNoun: "Flatbed",
        equipmentSlug: "flatbed",
        city: "Birmingham",
        state: "AL",
      }),
    ).toBe("Dedicated Class A Flatbed Driver in Birmingham, AL");
  });

  it("handles multi-word cities", () => {
    expect(
      buildPublicJobTitle({
        laneNoun: "Regional",
        equipmentNoun: "Dry Van",
        equipmentSlug: "dry_van",
        city: "Salt Lake City",
        state: "UT",
      }),
    ).toBe("Regional Class A Driver in Salt Lake City, UT");
  });
});

describe("deriveLaneNoun", () => {
  // The rule: home-daily wins outright. Drivers search "local CDL-A
  // driver jobs" — they don't search for "dedicated CDL-A driver jobs",
  // even when a Walmart dedicated account happens to be home-daily.
  it("home-daily beats 'Dedicated' in the position title", () => {
    expect(
      deriveLaneNoun(
        mkJob({
          positionTitle:
            "Local Position Only Dedicated Walmart Grocery Driver — Harrisonville, MO",
          acceptedHomeTimeTypes: ["daily"],
        }),
      ),
    ).toBe("Local");
  });

  it("home-daily beats 'OTR' in the position title", () => {
    expect(
      deriveLaneNoun(
        mkJob({
          positionTitle: "OTR Dry Van Driver",
          acceptedHomeTimeTypes: ["daily"],
        }),
      ),
    ).toBe("Local");
  });

  it("daily as part of a multi-value array still wins", () => {
    expect(
      deriveLaneNoun(
        mkJob({
          positionTitle: "Dedicated Account",
          acceptedHomeTimeTypes: ["daily", "weekly"],
        }),
      ),
    ).toBe("Local");
  });

  it("without home-daily, position title still drives lane", () => {
    expect(
      deriveLaneNoun(
        mkJob({
          positionTitle: "Dedicated Reefer — Memphis",
          acceptedHomeTimeTypes: ["weekly"],
        }),
      ),
    ).toBe("Dedicated");
  });

  it("falls through to OTR when nothing else matches", () => {
    expect(
      deriveLaneNoun(
        mkJob({
          positionTitle: "Class A Driver",
          acceptedHomeTimeTypes: null,
          hiringRadiusMiles: null,
        }),
      ),
    ).toBe("OTR");
  });
});
