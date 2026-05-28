import { describe, expect, it } from "vitest";
import type { ParsedArticle } from "../llm";
import {
  containsEmoji,
  findBlockedTerms,
  hasPlaceholder,
  truncateAtWordBoundary,
  validateAndFix,
} from "../validate";

function makeBody(words: number, extra = ""): string {
  return ("word ".repeat(words).trim() + " " + extra).trim();
}

function makeArticle(overrides: Partial<ParsedArticle> = {}): ParsedArticle {
  return {
    workingTitle: "Best CDL-A lanes",
    slug: "best-cdl-a-lanes",
    primaryKeyword: "best CDL-A lanes",
    secondaryKeywords: ["high-pay lanes", "regional CDL jobs"],
    titleTag: "Best CDL-A Lanes for Drivers in 2026",
    metaDescription: "Find lanes that pay best for CDL-A drivers.",
    bodyMarkdown: makeBody(1000),
    honestCaveat: "These numbers are not promises.",
    internalLinks: [],
    ctaBlock: "Start your free CDLA.jobs intake.",
    faq: [],
    faqSchemaJsonld: "",
    reviewFlags: "",
    ...overrides,
  };
}

describe("hasPlaceholder", () => {
  it("detects placeholder in body", () => {
    const a = makeArticle({
      bodyMarkdown: "Pay is [INSERT VERIFIED STAT] per mile.",
    });
    expect(hasPlaceholder(a)).toBe(true);
  });
  it("detects placeholder in honest caveat", () => {
    const a = makeArticle({
      honestCaveat: "Caveat: [INSERT VERIFIED STAT]",
    });
    expect(hasPlaceholder(a)).toBe(true);
  });
  it("detects placeholder in cta", () => {
    const a = makeArticle({
      ctaBlock: "Earn [INSERT VERIFIED STAT] starting now.",
    });
    expect(hasPlaceholder(a)).toBe(true);
  });
  it("returns false when no placeholder anywhere", () => {
    expect(hasPlaceholder(makeArticle())).toBe(false);
  });
});

describe("truncateAtWordBoundary", () => {
  it("returns original when within limit", () => {
    expect(truncateAtWordBoundary("hello world", 20)).toBe("hello world");
  });
  it("truncates at last space before limit", () => {
    expect(truncateAtWordBoundary("the quick brown fox jumped", 14)).toBe(
      "the quick",
    );
  });
  it("handles strings with no spaces (hard cut)", () => {
    expect(truncateAtWordBoundary("supercalifragilistic", 5)).toBe("super");
  });
});

describe("containsEmoji", () => {
  it("flags pictograph emoji", () => {
    expect(containsEmoji("Hello 🚛 driver")).toBe(true);
  });
  it("flags emoji sequences", () => {
    expect(containsEmoji("👍🏽 great")).toBe(true);
  });
  it("does not flag plain text", () => {
    expect(containsEmoji("Plain text with — em dash and 50%")).toBe(false);
  });
  it("does not flag trademark/copyright marks", () => {
    expect(containsEmoji("CDLA™ © 2026")).toBe(false);
  });
});

describe("findBlockedTerms", () => {
  it("returns empty when the blocklist is empty", () => {
    // The default blocklist is empty; this test pins that contract.
    expect(findBlockedTerms("any text mentioning anything")).toEqual([]);
  });
});

describe("validateAndFix", () => {
  it("passes a clean article", () => {
    const r = validateAndFix(makeArticle());
    expect(r.ok).toBe(true);
    expect(r.failureReasons).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it("fails when body word count too short", () => {
    const r = validateAndFix(makeArticle({ bodyMarkdown: makeBody(500) }));
    expect(r.ok).toBe(false);
    expect(r.failureReasons[0]).toMatch(/below minimum/);
  });

  it("fails when body word count too long", () => {
    const r = validateAndFix(makeArticle({ bodyMarkdown: makeBody(1600) }));
    expect(r.ok).toBe(false);
    expect(r.failureReasons[0]).toMatch(/above maximum/);
  });

  it("truncates oversized title tag without failing", () => {
    const longTitle = "a".repeat(80);
    const r = validateAndFix(makeArticle({ titleTag: longTitle }));
    expect(r.ok).toBe(true);
    expect(r.fixedArticle.titleTag.length).toBeLessThanOrEqual(60);
    expect(r.warnings.some((w) => w.includes("title_tag"))).toBe(true);
  });

  it("truncates oversized meta description without failing", () => {
    const longMeta =
      "word ".repeat(50).trim(); // ~250 chars
    const r = validateAndFix(makeArticle({ metaDescription: longMeta }));
    expect(r.ok).toBe(true);
    expect(r.fixedArticle.metaDescription.length).toBeLessThanOrEqual(155);
    expect(r.warnings.some((w) => w.includes("meta_description"))).toBe(true);
  });

  it("fails on emoji in body", () => {
    const r = validateAndFix(
      makeArticle({ bodyMarkdown: makeBody(1000) + " 🚛" }),
    );
    expect(r.ok).toBe(false);
    expect(r.failureReasons.some((f) => f.includes("Emoji"))).toBe(true);
  });

  it("fails on invalid FAQ JSON-LD", () => {
    const r = validateAndFix(
      makeArticle({ faqSchemaJsonld: "{not valid json" }),
    );
    expect(r.ok).toBe(false);
    expect(
      r.failureReasons.some((f) => f.includes("faq_schema_jsonld")),
    ).toBe(true);
  });

  it("accepts empty FAQ schema string", () => {
    const r = validateAndFix(makeArticle({ faqSchemaJsonld: "" }));
    expect(r.ok).toBe(true);
  });
});
