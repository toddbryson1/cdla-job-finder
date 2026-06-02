import { describe, expect, it } from "vitest";
import { composeDisplayDescription } from "@/lib/match-display-data";

// composeDisplayDescription is the single source of truth for "what
// prose do we show on a match card when the carrier_jobs row has a
// stub description column?" The chat MatchCard reads this through
// loadDisplayExtras → /api/match → DebbieMatchView.descriptionSnippet
// — so a regression here is driver-visible immediately.

describe("composeDisplayDescription", () => {
  it("returns null when every input is null", () => {
    expect(
      composeDisplayDescription({
        description: null,
        displayLaneDescription: null,
        displayHomeTimeDescription: null,
        displayBenefitsSummary: null,
      }),
    ).toBeNull();
  });

  it("prefers the canonical description when it has substantive content (≥60 chars)", () => {
    const longDesc =
      "Run dry van OTR from Atlanta to the Midwest. Home every 11–14 days. Average gross $1,700/wk after orientation.";
    expect(
      composeDisplayDescription({
        description: longDesc,
        displayLaneDescription: "Midwest OTR",
        displayHomeTimeDescription: "11 days out",
        displayBenefitsSummary: "Health + dental",
      }),
    ).toBe(longDesc);
  });

  it("falls back to display fields when canonical description is too thin to be useful (e.g. 'OTR')", () => {
    // Threshold catches the most common stub strings — bare "OTR", "Solo",
    // "Dedicated" — which add nothing the position title doesn't already say.
    const result = composeDisplayDescription({
      description: "OTR",
      displayLaneDescription: "Atlanta to the Midwest",
      displayHomeTimeDescription: "Home every weekend",
      displayBenefitsSummary: null,
    });
    expect(result).toBe("Atlanta to the Midwest. Home every weekend.");
  });

  it("composes from display fields when description is null entirely", () => {
    const result = composeDisplayDescription({
      description: null,
      displayLaneDescription: "OTR — Southeast lanes",
      displayHomeTimeDescription: "10 days out, 3 home",
      displayBenefitsSummary: "Pet-friendly, rider OK",
    });
    expect(result).toBe(
      "OTR — Southeast lanes. 10 days out, 3 home. Pet-friendly, rider OK.",
    );
  });

  it("skips nulls when composing", () => {
    expect(
      composeDisplayDescription({
        description: null,
        displayLaneDescription: "OTR",
        displayHomeTimeDescription: null,
        displayBenefitsSummary: null,
      }),
    ).toBe("OTR.");
  });

  it("strips trailing punctuation from each piece before joining (no double periods)", () => {
    const result = composeDisplayDescription({
      description: null,
      displayLaneDescription: "OTR Midwest.",
      displayHomeTimeDescription: "Home weekly,",
      displayBenefitsSummary: "Health, dental;",
    });
    expect(result).toBe("OTR Midwest. Home weekly. Health, dental.");
    // No double periods anywhere.
    expect(result).not.toContain("..");
  });

  it("skips whitespace-only display fields (treats them as null)", () => {
    expect(
      composeDisplayDescription({
        description: null,
        displayLaneDescription: "  ",
        displayHomeTimeDescription: "\n\t",
        displayBenefitsSummary: "Real benefits",
      }),
    ).toBe("Real benefits.");
  });

  it("falls back to short canonical description when display fields are all null", () => {
    // No display fields available — show whatever description we have,
    // even if short. Better than nothing.
    expect(
      composeDisplayDescription({
        description: "OTR",
        displayLaneDescription: null,
        displayHomeTimeDescription: null,
        displayBenefitsSummary: null,
      }),
    ).toBe("OTR");
  });

  it("trims canonical description before length-checking against the 60-char threshold", () => {
    // 60 chars of trimmed content qualifies; 60 chars with surrounding
    // whitespace also qualifies once trimmed.
    const sixty = "A".repeat(60);
    expect(
      composeDisplayDescription({
        description: `  ${sixty}  `,
        displayLaneDescription: "OTR",
        displayHomeTimeDescription: null,
        displayBenefitsSummary: null,
      }),
    ).toBe(sixty);
  });
});
