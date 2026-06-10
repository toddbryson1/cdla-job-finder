import { describe, expect, it } from "vitest";
import { deriveRunningArea } from "@/lib/geo/running-area";

describe("deriveRunningArea", () => {
  it("OTR when there's no hiring radius (hires nationwide)", () => {
    const r = deriveRunningArea({
      acceptedHomeTimeTypes: ["otr"],
      preferredRegions: [],
      hiringRadiusMiles: null,
      domicileState: "GA",
    });
    expect(r.scope).toBe("otr");
    expect(r.states).toContain("GA");
    expect(r.states.length).toBeGreaterThan(40); // lower-48
    expect(r.states).not.toContain("AK");
  });

  it("regional from preferred regions (southeast → its states)", () => {
    const r = deriveRunningArea({
      acceptedHomeTimeTypes: ["weekly"],
      preferredRegions: ["southeast"],
      hiringRadiusMiles: 300,
      domicileState: "GA",
    });
    expect(r.scope).toBe("regional");
    expect(r.states).toEqual(
      expect.arrayContaining(["GA", "FL", "AL", "SC", "NC", "TN"]),
    );
  });

  it("local when home-daily with a radius and no broad region", () => {
    const r = deriveRunningArea({
      acceptedHomeTimeTypes: ["daily"],
      preferredRegions: [],
      hiringRadiusMiles: 100,
      domicileState: "TX",
    });
    expect(r.scope).toBe("local");
    expect(r.states).toEqual(["TX"]);
  });

  it("falls back to the domicile state when regional but unspecified", () => {
    const r = deriveRunningArea({
      acceptedHomeTimeTypes: ["weekly"],
      preferredRegions: [],
      hiringRadiusMiles: 250,
      domicileState: "OH",
    });
    expect(r.scope).toBe("regional");
    expect(r.states).toEqual(["OH"]);
  });
});
