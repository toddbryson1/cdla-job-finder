import { describe, expect, it } from "vitest";
import { extractFinalJsonBlock, parseEnvelope } from "../llm";

describe("extractFinalJsonBlock", () => {
  it("extracts the json from a single fenced block", () => {
    const text = "Some prose.\n\n```json\n{\"a\": 1}\n```\n";
    expect(extractFinalJsonBlock(text)).toBe(`{"a": 1}`);
  });

  it("returns the LAST json block when multiple are present", () => {
    const text =
      "First example:\n```json\n{\"x\": 1}\n```\n\nReal envelope:\n```json\n{\"x\": 2}\n```";
    expect(extractFinalJsonBlock(text)).toBe(`{"x": 2}`);
  });

  it("tolerates leading/trailing whitespace in fence tag", () => {
    const text = "```  json  \n{\"ok\": true}\n  ```";
    expect(extractFinalJsonBlock(text)).toBe(`{"ok": true}`);
  });

  it("throws when no json fence is found", () => {
    expect(() => extractFinalJsonBlock("just prose")).toThrow(
      /No fenced JSON block/,
    );
  });
});

describe("parseEnvelope", () => {
  const minimalValidEnvelope = {
    workingTitle: "How CDL-A drivers find the best lanes",
    slug: "best-cdl-a-lanes",
    primaryKeyword: "best CDL-A lanes",
    titleTag: "Best CDL-A Lanes for Drivers in 2026",
    metaDescription: "Find the lanes that pay best for CDL-A drivers.",
    bodyMarkdown:
      "# Best CDL-A lanes\n\nThis is the answer-first opening that immediately answers the question the driver came to find. " +
      "Then it expands across several paragraphs into the actual mechanics of finding the best-paying lanes. " +
      "It is at least 100 characters long because the Zod min(100) requires it.",
  };

  it("accepts a minimal valid envelope with defaults filled in", () => {
    const out = parseEnvelope(JSON.stringify(minimalValidEnvelope));
    expect(out.secondaryKeywords).toEqual([]);
    expect(out.internalLinks).toEqual([]);
    expect(out.faq).toEqual([]);
    expect(out.honestCaveat).toBe("");
    expect(out.ctaBlock).toBe("");
    expect(out.faqSchemaJsonld).toBe("");
    expect(out.reviewFlags).toBe("");
  });

  it("preserves arrays when supplied", () => {
    const env = {
      ...minimalValidEnvelope,
      secondaryKeywords: ["one", "two"],
      faq: [{ question: "Q1?", answer: "A1." }],
      internalLinks: [{ anchor: "intake", targetType: "intake form" }],
    };
    const out = parseEnvelope(JSON.stringify(env));
    expect(out.secondaryKeywords).toEqual(["one", "two"]);
    expect(out.faq[0].question).toBe("Q1?");
    expect(out.internalLinks[0].anchor).toBe("intake");
  });

  it("rejects envelopes missing required fields", () => {
    const { workingTitle: _omit, ...incomplete } = minimalValidEnvelope;
    expect(() => parseEnvelope(JSON.stringify(incomplete))).toThrow();
  });

  it("rejects envelopes with body too short", () => {
    const tooShort = { ...minimalValidEnvelope, bodyMarkdown: "short." };
    expect(() => parseEnvelope(JSON.stringify(tooShort))).toThrow();
  });

  it("rejects malformed JSON", () => {
    expect(() => parseEnvelope("not { json")).toThrow();
  });
});
