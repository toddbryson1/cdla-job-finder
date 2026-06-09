import { describe, expect, it } from "vitest";
import { rankCandidates } from "@/lib/matching/softRank";
import type { CandidateRow, DriverProfile } from "@/lib/matching/hardFilter";

// These exercise the advisor-mode ranking directly on synthetic rows so
// the scoring math is pinned without DB seeding. They cover the four
// behaviors the spec calls out by name: unset-tier neutrality, the
// experience-tier flip (C.R. England), the priority flip (Swift/JB-Hunt
// home-time-vs-pay tradeoff), and sponsorship-never-overrides-fit.

function row(over: Partial<CandidateRow> & { job_id: string }): CandidateRow {
  return {
    job_id: over.job_id,
    carrier_id: over.carrier_id ?? `carrier-${over.job_id}`,
    carrier_name: over.carrier_name ?? "Carrier",
    carrier_kind: over.carrier_kind ?? "prospect",
    carrier_tier: over.carrier_tier ?? "none",
    tier_1_billing_status: over.tier_1_billing_status ?? null,
    position_title: over.position_title ?? "OTR Driver",
    equipment: over.equipment ?? "dry-van",
    domicile_city: over.domicile_city ?? "Atlanta",
    domicile_state: over.domicile_state ?? "GA",
    hiring_radius_miles: over.hiring_radius_miles ?? 100,
    distance_miles: over.distance_miles ?? 20,
    pay_range_max_weekly_usd: over.pay_range_max_weekly_usd ?? null,
    display_pay_range_min_weekly_usd: over.display_pay_range_min_weekly_usd ?? null,
    display_pay_range_max_weekly_usd: over.display_pay_range_max_weekly_usd ?? null,
    accepted_home_time_types: over.accepted_home_time_types ?? ["weekly"],
    preferred_equipment_experience: over.preferred_equipment_experience ?? [],
    preferred_regions: over.preferred_regions ?? [],
    carrier_fit_tier_profile: over.carrier_fit_tier_profile ?? null,
    application_surface: over.application_surface ?? "tenstreet_intelliapp",
    application_url: over.application_url ?? "https://example.com/apply",
    application_phone: over.application_phone ?? null,
    last_verified_at: over.last_verified_at ?? new Date("2026-06-01"),
    verification_status: over.verification_status ?? "verified",
    data_quality: over.data_quality ?? "complete",
  };
}

function driver(
  over: Partial<DriverProfile> & { equipmentRun: string[]; desiredRegions: string[] },
): DriverProfile & { equipmentRun: string[]; desiredRegions: string[] } {
  return {
    id: "driver-1",
    homeLat: 33.74,
    homeLng: -84.38,
    willingToRelocate: false,
    desiredEquipment: ["dry-van"],
    experienceMonths: over.experienceMonths ?? 6,
    otrExperienceMonths: 0,
    totalCareerExperienceMonths: null,
    monthsSinceLastDrove: null,
    cdlState: "GA",
    endorsements: [],
    homeTime: over.homeTime ?? ["weekly"],
    minWeeklyPay: 0,
    terminated: false,
    failedDot: false,
    sapStatus: "not-in-sap",
    priorityRanking: over.priorityRanking ?? null,
    payFloorMinWeeklyUsd: over.payFloorMinWeeklyUsd ?? null,
    payFloorMaxWeeklyUsd: null,
    careerGoalType: over.careerGoalType ?? null,
    careerGoalDetail: over.careerGoalDetail ?? null,
    ...over,
  };
}

const ENGLAND_PROFILE = {
  experience: { strongMinMonths: 3, strongMaxMonths: 12, fadesAfterMonths: 24 },
};

describe("rankCandidates — neutral mode (no priority_ranking)", () => {
  it("an unset fit-tier produces the classic neutral score, not an invented one", () => {
    const d = driver({ equipmentRun: ["dry-van"], desiredRegions: ["southeast"] });
    const [r] = rankCandidates(
      [
        row({
          job_id: "j1",
          preferred_equipment_experience: ["dry-van"],
          preferred_regions: ["southeast"],
          distance_miles: 10, // <=50 → distanceScore 1
          data_quality: "complete", // bonus 1
          carrier_fit_tier_profile: null, // NEUTRAL
        }),
      ],
      d,
    );
    // equipmentOverlap(1)*2 + region(1) + distance(1) + dataQuality(1) = 5
    expect(r.score).toBe(5);
    expect(r.fitTierAdjustment).toBe(0);
    expect(r.reasons).toEqual([]);
  });
});

describe("rankCandidates — fit-tier experience flip (C.R. England)", () => {
  const england = row({
    job_id: "england",
    carrier_name: "C.R. England",
    carrier_fit_tier_profile: ENGLAND_PROFILE,
  });
  const neutralCarrier = row({ job_id: "neutral", carrier_name: "Neutral Co" });

  it("ranks England ABOVE a neutral carrier for a 6-month driver", () => {
    const ranked = rankCandidates(
      [neutralCarrier, england],
      driver({ equipmentRun: [], desiredRegions: [], experienceMonths: 6 }),
    );
    expect(ranked[0].row.carrier_name).toBe("C.R. England");
  });

  it("ranks England BELOW the neutral carrier for a 3-year driver", () => {
    const ranked = rankCandidates(
      [england, neutralCarrier],
      driver({ equipmentRun: [], desiredRegions: [], experienceMonths: 36 }),
    );
    expect(ranked[0].row.carrier_name).toBe("Neutral Co");
    const englandRanked = ranked.find((r) => r.row.carrier_name === "C.R. England")!;
    // Demotion comes with a neutral, non-disparaging reason.
    expect(englandRanked.reasons.join(" ")).toMatch(/pay more/i);
  });
});

describe("rankCandidates — priority flip (home-time vs pay)", () => {
  // Big carrier: great home time (daily), modest pay. Small carrier:
  // higher pay, weekly home time only.
  const bigCarrier = row({
    job_id: "big",
    carrier_name: "Swift",
    accepted_home_time_types: ["daily", "weekly"],
    display_pay_range_max_weekly_usd: 1200,
  });
  const smallCarrier = row({
    job_id: "small",
    carrier_name: "Small Specialized",
    accepted_home_time_types: ["weekly"],
    display_pay_range_max_weekly_usd: 1800,
  });

  it("home-time-first driver sees the big carrier #1", () => {
    const ranked = rankCandidates(
      [smallCarrier, bigCarrier],
      driver({
        equipmentRun: [],
        desiredRegions: [],
        homeTime: ["daily", "weekly"],
        priorityRanking: ["home_time", "pay"],
        payFloorMinWeeklyUsd: 1000,
      }),
    );
    expect(ranked[0].row.carrier_name).toBe("Swift");
  });

  it("pay-first driver sees the small carrier #1 — same two carriers", () => {
    const ranked = rankCandidates(
      [bigCarrier, smallCarrier],
      driver({
        equipmentRun: [],
        desiredRegions: [],
        homeTime: ["daily", "weekly"],
        priorityRanking: ["pay", "home_time"],
        payFloorMinWeeklyUsd: 1000,
      }),
    );
    expect(ranked[0].row.carrier_name).toBe("Small Specialized");
  });
});

describe("rankCandidates — sponsorship never overrides fit", () => {
  it("a worse-fit partner does NOT outrank a better-fit prospect", () => {
    // Prospect genuinely fits better (equipment overlap + region).
    const betterFitProspect = row({
      job_id: "prospect",
      carrier_name: "Better Fit Prospect",
      carrier_kind: "prospect",
      preferred_equipment_experience: ["dry-van"],
      preferred_regions: ["southeast"],
    });
    // Partner is sponsored but a weaker fit (no overlap).
    const sponsoredPartner = row({
      job_id: "partner",
      carrier_name: "Sponsored Partner",
      carrier_kind: "partner",
      preferred_equipment_experience: [],
      preferred_regions: [],
    });
    const ranked = rankCandidates(
      [sponsoredPartner, betterFitProspect],
      driver({ equipmentRun: ["dry-van"], desiredRegions: ["southeast"] }),
    );
    expect(ranked[0].row.carrier_name).toBe("Better Fit Prospect");
  });

  it("partner wins ONLY as a tiebreak when fit is genuinely equal", () => {
    const prospect = row({ job_id: "j-prospect", carrier_kind: "prospect" });
    const partner = row({ job_id: "j-partner", carrier_kind: "partner" });
    const ranked = rankCandidates(
      [prospect, partner],
      driver({ equipmentRun: [], desiredRegions: [] }),
    );
    // Identical fit → partner-first tiebreak applies.
    expect(ranked[0].row.carrier_kind).toBe("partner");
  });
});
