import { describe, expect, it } from "vitest";
import {
  buildRankedRecommendation,
  reasonLine,
} from "@/lib/advisor/ranked-recommendation";
import { buildAdvisorChatPreamble } from "@/lib/debbie/match-render";
import { BANNED_PHRASES } from "@/lib/advisor/copy";
import type { Match } from "@/lib/matching/types";

function match(over: Partial<Match> & { jobId: string }): Match {
  return {
    jobId: over.jobId,
    carrierId: over.carrierId ?? "c",
    carrierName: over.carrierName ?? "Carrier",
    carrierKind: over.carrierKind ?? "partner",
    carrierTier: over.carrierTier ?? "none",
    label: over.label ?? "Referral Partner",
    positionTitle: over.positionTitle ?? "OTR Driver",
    equipment: over.equipment ?? "dry-van",
    domicileCity: over.domicileCity ?? "Atlanta",
    domicileState: over.domicileState ?? "GA",
    distanceMilesFromDriverHome: over.distanceMilesFromDriverHome ?? 25,
    payRangeMinWeekly: over.payRangeMinWeekly ?? null,
    payRangeMaxWeekly: over.payRangeMaxWeekly ?? null,
    payWarning: over.payWarning ?? null,
    applicationSurface: over.applicationSurface ?? "tenstreet_intelliapp",
    applicationUrl: over.applicationUrl ?? null,
    applicationPhone: over.applicationPhone ?? null,
    softRankScore: over.softRankScore ?? 0,
    fitReasons: over.fitReasons ?? [],
    exclusivityWindowEndsAt: over.exclusivityWindowEndsAt ?? null,
    verificationStatus: over.verificationStatus ?? "verified",
    dataQuality: over.dataQuality ?? "complete",
  };
}

describe("buildRankedRecommendation", () => {
  it("returns an empty shape for no matches", () => {
    expect(buildRankedRecommendation([])).toEqual({
      top: null,
      backups: [],
      totalConsidered: 0,
    });
  });

  it("splits a #1 and capped backups, preserving engine order", () => {
    const matches = Array.from({ length: 8 }, (_, i) =>
      match({ jobId: `j${i}`, carrierName: `Carrier ${i}` }),
    );
    const rec = buildRankedRecommendation(matches, { maxBackups: 4 });
    expect(rec.top?.jobId).toBe("j0");
    expect(rec.backups).toHaveLength(4);
    expect(rec.backups[0].jobId).toBe("j1");
    expect(rec.totalConsidered).toBe(8);
  });
});

describe("reasonLine", () => {
  it("uses the engine's fit reasons when present", () => {
    const line = reasonLine(match({ jobId: "j", fitReasons: ["pays above your floor"] }));
    expect(line).toMatch(/Pays above your floor/);
  });

  it("falls back to a neutral descriptor when there are no reasons", () => {
    const line = reasonLine(
      match({ jobId: "j", fitReasons: [], equipment: "reefer", domicileCity: "Dallas" }),
    );
    expect(line).toMatch(/reefer/);
    expect(line).toMatch(/Dallas/);
  });
});

describe("buildAdvisorChatPreamble", () => {
  it("speaks the strength + top pick without guaranteeing or predicting", () => {
    const s = buildAdvisorChatPreamble(4, "Salt Lake City", "UT", {
      topStrength: "you're in a strong spot — clean record, one carrier",
      topPickName: "C.R. England",
      topPickReason: "a strong on-ramp at your experience level",
    });
    expect(s).toMatch(/C\.R\. England/);
    expect(s).toMatch(/ranked the rest below/i);
    const lower = s.toLowerCase();
    for (const banned of BANNED_PHRASES) expect(lower).not.toContain(banned);
  });

  it("falls back to the honest zero-matches message at count 0", () => {
    const s = buildAdvisorChatPreamble(0, "Casper", "WY", {});
    expect(s).toMatch(/nothing matches that exactly/i);
  });
});
