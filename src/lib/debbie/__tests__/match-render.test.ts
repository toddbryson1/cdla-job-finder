import { describe, expect, it } from "vitest";
import {
  ASYNC_FALLBACK_TIMEOUT_MS,
  buildAsyncFallbackMessage,
  buildMatchesPreamble,
  buildZeroMatchesMessage,
  equipmentLabel,
  payRangeLabel,
} from "@/lib/debbie/match-render";

describe("ASYNC_FALLBACK_TIMEOUT_MS", () => {
  // Spec §4.5 hard-locks this at 5s. A regression here would change
  // when Debbie shifts from "thinking" to "I'll let you know later"
  // for every driver — much more visible than it looks. Pin it.
  it("is exactly 5000ms per spec §4.5", () => {
    expect(ASYNC_FALLBACK_TIMEOUT_MS).toBe(5000);
  });
});

describe("equipmentLabel", () => {
  it("pretties common slugs", () => {
    expect(equipmentLabel("dry-van")).toBe("Dry Van");
    expect(equipmentLabel("reefer")).toBe("Reefer");
    expect(equipmentLabel("flatbed")).toBe("Flatbed");
    expect(equipmentLabel("tanker")).toBe("Tanker");
    expect(equipmentLabel("auto-hauler")).toBe("Auto Hauler");
    expect(equipmentLabel("oversized")).toBe("Heavy Haul");
  });

  it("handles whitespace + casing", () => {
    expect(equipmentLabel("  REEFER ")).toBe("Reefer");
    expect(equipmentLabel("Dry-Van")).toBe("Dry Van");
  });

  it("falls back to title-casing unknown slugs", () => {
    expect(equipmentLabel("car-carrier")).toBe("Car Carrier");
    expect(equipmentLabel("logging")).toBe("Logging");
  });
});

describe("payRangeLabel", () => {
  it("renders min–max when both present", () => {
    expect(payRangeLabel(1400, 1800)).toBe("$1,400–$1,800/wk");
    expect(payRangeLabel(1000, 2500)).toBe("$1,000–$2,500/wk");
  });

  it("renders 'Up to' when only max present", () => {
    expect(payRangeLabel(null, 1800)).toBe("Up to $1,800/wk");
  });

  it("renders 'From' when only min present", () => {
    expect(payRangeLabel(1400, null)).toBe("From $1,400/wk");
  });

  it("drops the line entirely when neither is known", () => {
    // Spec §4.5: don't say "pay not disclosed" three times in a row.
    expect(payRangeLabel(null, null)).toBeNull();
  });
});

describe("buildMatchesPreamble", () => {
  it("uses the singular when there's exactly one match", () => {
    const msg = buildMatchesPreamble(1, "Atlanta", "GA");
    expect(msg).toContain("1 carrier hiring");
    expect(msg).not.toContain("carriers hiring");
    expect(msg).toContain("near Atlanta, GA");
  });

  it("uses the plural for multiple matches", () => {
    const msg = buildMatchesPreamble(5, "Atlanta", "GA");
    expect(msg).toContain("5 carriers hiring");
  });

  it("drops the location suffix when both city and state are null", () => {
    const msg = buildMatchesPreamble(3, null, null);
    expect(msg).not.toContain("near");
    expect(msg).not.toContain("in ");
    expect(msg).toContain("3 carriers");
  });

  it("falls back to state-only when city is missing", () => {
    const msg = buildMatchesPreamble(2, null, "TX");
    expect(msg).toContain("in TX");
  });

  it("falls back to city-only when state is missing", () => {
    const msg = buildMatchesPreamble(2, "Phoenix", null);
    expect(msg).toContain("near Phoenix");
  });

  it("hands off to the zero-matches branch when count is 0", () => {
    const msg = buildMatchesPreamble(0, "Atlanta", "GA");
    expect(msg).toContain("Nothing matches");
  });

  it("voice rule: no emojis, no exclamation, plain warm tone", () => {
    const msg = buildMatchesPreamble(3, "Atlanta", "GA");
    expect(msg).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    // One ! max per Debbie voice; preamble shouldn't have any.
    expect((msg.match(/!/g) ?? []).length).toBe(0);
  });
});

describe("buildZeroMatchesMessage", () => {
  // Spec §4.5: honest, not pivoting to false hope. The nurture
  // promise ("New carriers are joining...") is load-bearing.
  it("includes the nurture promise", () => {
    const msg = buildZeroMatchesMessage("Atlanta", "GA");
    expect(msg).toContain("Nothing matches");
    expect(msg).toContain("New carriers are joining");
    expect(msg.toLowerCase()).toMatch(/day|week/);
  });

  it("does not pretend there is partial-match hope", () => {
    // The literal "but" / "however" pattern would soften the honesty
    // spec §4.5 calls for. Guard against creep.
    const msg = buildZeroMatchesMessage("Atlanta", "GA");
    expect(msg.toLowerCase()).not.toContain("however");
  });

  it("drops the location suffix when both are null", () => {
    const msg = buildZeroMatchesMessage(null, null);
    expect(msg).not.toContain("near");
    expect(msg).toContain("Nothing matches");
  });
});

describe("buildAsyncFallbackMessage", () => {
  it("emails-driver variant — promises email + 'come back later'", () => {
    const msg = buildAsyncFallbackMessage(true);
    expect(msg).toMatch(/email/i);
    expect(msg.toLowerCase()).toContain("working on it");
  });

  it("anonymous-driver variant — no email promise (we don't have one)", () => {
    const msg = buildAsyncFallbackMessage(false);
    expect(msg).not.toMatch(/email/i);
    expect(msg.toLowerCase()).toContain("working on it");
    expect(msg.toLowerCase()).toMatch(/hang|here/);
  });
});
