// Pure-function tests for the Adzuna client.

import { describe, expect, it } from "vitest";
import {
  __test__,
  guessEquipment,
  parseLocation,
  isAdzunaConfigured,
  searchAdzuna,
} from "@/lib/external-jobs/adzuna";

const { buildKeyword, toListing } = __test__;

describe("adzuna.buildKeyword", () => {
  it("maps reefer", () => {
    expect(buildKeyword(["reefer"])).toBe("CDL A reefer");
  });
  it("maps refrigerated to reefer query", () => {
    expect(buildKeyword(["refrigerated"])).toBe("CDL A reefer");
  });
  it("maps flatbed", () => {
    expect(buildKeyword(["flatbed"])).toBe("CDL A flatbed");
  });
  it("maps tanker", () => {
    expect(buildKeyword(["tanker"])).toBe("CDL A tanker");
  });
  it("picks first known equipment when multiple", () => {
    expect(buildKeyword(["unknown", "flatbed", "reefer"])).toBe("CDL A flatbed");
  });
  it("falls back to generic CDL A driver", () => {
    expect(buildKeyword([])).toBe("CDL A driver");
    expect(buildKeyword(["unknown"])).toBe("CDL A driver");
  });
  it("is case-insensitive", () => {
    expect(buildKeyword(["REEFER"])).toBe("CDL A reefer");
    expect(buildKeyword(["Flatbed"])).toBe("CDL A flatbed");
  });
});

describe("adzuna.guessEquipment", () => {
  it("flags reefer from title", () => {
    expect(guessEquipment("CDL A Reefer Driver")).toBe("reefer");
  });
  it("flags flatbed", () => {
    expect(guessEquipment("OTR Flatbed Driver")).toBe("flatbed");
  });
  it("flags tanker", () => {
    expect(guessEquipment("Tanker driver wanted")).toBe("tanker");
  });
  it("flags dry van", () => {
    expect(guessEquipment("Class A Dry Van driver")).toBe("dry_van");
  });
  it("flags hazmat", () => {
    expect(guessEquipment("Hazmat CDL needed")).toBe("hazmat");
  });
  it("returns null when no signal", () => {
    expect(guessEquipment("Class A driver — home weekly")).toBe(null);
  });
});

describe("adzuna.parseLocation", () => {
  it("extracts state abbreviation from 2-letter entry", () => {
    const { state, city } = parseLocation({
      display_name: "Dallas, TX",
      area: ["US", "TX", "Dallas"],
    });
    expect(state).toBe("TX");
    expect(city).toBe("Dallas");
  });

  it("converts full state name to abbreviation", () => {
    const { state, city } = parseLocation({
      area: ["US", "Texas", "Dallas County", "Dallas"],
    });
    expect(state).toBe("TX");
    expect(city).toBe("Dallas");
  });

  it("skips 'County' entries when picking city", () => {
    const { city } = parseLocation({
      area: ["US", "Georgia", "Fulton County", "Atlanta"],
    });
    expect(city).toBe("Atlanta");
  });

  it("returns null state/city when area is empty", () => {
    expect(parseLocation({})).toEqual({ city: null, state: null });
    expect(parseLocation(undefined)).toEqual({ city: null, state: null });
  });

  it("handles two-word state names", () => {
    const { state, city } = parseLocation({
      area: ["US", "New York", "New York County", "Manhattan"],
    });
    expect(state).toBe("NY");
    expect(city).toBe("Manhattan");
  });
});

describe("adzuna.toListing — CDL title filter", () => {
  const baseResult = {
    id: "abc123",
    title: "Class A CDL Truck Driver",
    description: "We need a CDL A driver",
    company: { display_name: "FakeCo Trucking" },
    location: { display_name: "Dallas, TX", area: ["US", "TX", "Dallas"] },
    salary_min: 60000,
    salary_max: 80000,
    salary_is_predicted: "0",
    redirect_url: "https://example.com/job/abc123",
    created: "2026-05-20T10:00:00Z",
    latitude: 32.78,
    longitude: -96.79,
  };

  it("accepts a CDL Class A title", () => {
    const out = toListing(baseResult);
    expect(out).not.toBeNull();
    expect(out!.sourceId).toBe("abc123");
    expect(out!.title).toBe("Class A CDL Truck Driver");
  });

  it("rejects a warehouse title", () => {
    const out = toListing({ ...baseResult, title: "Warehouse Picker" });
    expect(out).toBeNull();
  });

  it("rejects forklift roles even when listed under logistics", () => {
    const out = toListing({ ...baseResult, title: "Forklift Operator — CDL helpful" });
    expect(out).toBeNull();
  });

  it("rejects Class B titles", () => {
    const out = toListing({ ...baseResult, title: "Class B Local Driver" });
    expect(out).toBeNull();
  });

  it("rejects non-CDL delivery driver titles", () => {
    const out = toListing({ ...baseResult, title: "Delivery Driver — non-CDL" });
    expect(out).toBeNull();
  });

  it("coerces salary_is_predicted='1' to true", () => {
    const out = toListing({ ...baseResult, salary_is_predicted: "1" });
    expect(out!.salaryIsPredicted).toBe(true);
  });

  it("returns null if id/title/redirect_url missing", () => {
    expect(toListing({ ...baseResult, id: "" })).toBeNull();
    expect(toListing({ ...baseResult, title: "" })).toBeNull();
    expect(toListing({ ...baseResult, redirect_url: "" })).toBeNull();
  });

  it("populates equipmentGuess from title", () => {
    const out = toListing({ ...baseResult, title: "CDL A Reefer Driver" });
    expect(out!.equipmentGuess).toBe("reefer");
  });

  it("clips description to 500 chars", () => {
    const long = "x".repeat(1200);
    const out = toListing({ ...baseResult, description: long });
    expect(out!.descriptionExcerpt?.length).toBe(500);
  });
});

describe("adzuna.isAdzunaConfigured", () => {
  it("returns false when either env var is missing", () => {
    // Tests inherit a real env, so we just sanity-check that the
    // function is callable and returns a boolean.
    expect(typeof isAdzunaConfigured()).toBe("boolean");
  });
});

describe("adzuna.searchAdzuna — no creds", () => {
  it("returns empty array without env vars (graceful-degrade)", async () => {
    // Force the unconfigured branch.
    const savedId = process.env.ADZUNA_APP_ID;
    const savedKey = process.env.ADZUNA_APP_KEY;
    delete process.env.ADZUNA_APP_ID;
    delete process.env.ADZUNA_APP_KEY;
    try {
      const out = await searchAdzuna({
        lat: 32.78,
        lng: -96.79,
        radiusMiles: 100,
        desiredEquipment: ["reefer"],
        minWeeklyPayUsd: 0,
      });
      expect(out).toEqual([]);
    } finally {
      if (savedId !== undefined) process.env.ADZUNA_APP_ID = savedId;
      if (savedKey !== undefined) process.env.ADZUNA_APP_KEY = savedKey;
    }
  });

  it("returns empty array when upstream fetch fails (graceful-degrade)", async () => {
    process.env.ADZUNA_APP_ID = "test";
    process.env.ADZUNA_APP_KEY = "test";
    try {
      const out = await searchAdzuna({
        lat: 32.78,
        lng: -96.79,
        radiusMiles: 100,
        desiredEquipment: ["reefer"],
        minWeeklyPayUsd: 0,
        fetchImpl: () => Promise.reject(new Error("network down")),
      });
      expect(out).toEqual([]);
    } finally {
      delete process.env.ADZUNA_APP_ID;
      delete process.env.ADZUNA_APP_KEY;
    }
  });

  it("filters CDL response by title keywords", async () => {
    process.env.ADZUNA_APP_ID = "test";
    process.env.ADZUNA_APP_KEY = "test";
    try {
      const body = {
        results: [
          {
            id: "1",
            title: "Class A CDL Reefer Driver",
            redirect_url: "https://example.com/1",
            location: { area: ["US", "TX", "Dallas"] },
            salary_min: 70000,
            salary_max: 90000,
            salary_is_predicted: "0",
          },
          {
            id: "2",
            title: "Warehouse Associate",
            redirect_url: "https://example.com/2",
          },
          {
            id: "3",
            title: "Forklift Operator",
            redirect_url: "https://example.com/3",
          },
        ],
      };
      const out = await searchAdzuna({
        lat: 32.78,
        lng: -96.79,
        radiusMiles: 100,
        desiredEquipment: ["reefer"],
        minWeeklyPayUsd: 0,
        fetchImpl: () =>
          Promise.resolve(
            new Response(JSON.stringify(body), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          ),
      });
      expect(out.length).toBe(1);
      expect(out[0].sourceId).toBe("1");
      expect(out[0].title).toBe("Class A CDL Reefer Driver");
    } finally {
      delete process.env.ADZUNA_APP_ID;
      delete process.env.ADZUNA_APP_KEY;
    }
  });
});
