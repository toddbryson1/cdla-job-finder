import { describe, expect, it } from "vitest";
import { buildPublicJobTitle } from "@/lib/job-seo-copy";

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
