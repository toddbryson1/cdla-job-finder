import { describe, expect, it } from "vitest";
import { stripLinkMarkers, urlForSlug } from "../publish";

describe("stripLinkMarkers", () => {
  it("removes a simple link marker mid-sentence", () => {
    const input = "Check out [LINK: this guide -> intake page] for details.";
    const out = stripLinkMarkers(input);
    expect(out).toBe("Check out for details.");
  });

  it("removes multiple markers on different lines", () => {
    const input =
      "Para one with [LINK: a -> b] in it.\n\nPara two with [LINK: c -> d].";
    const out = stripLinkMarkers(input);
    expect(out).toBe("Para one with in it.\n\nPara two with.");
  });

  it("preserves paragraph breaks (single blank line between paragraphs)", () => {
    const input = "First.\n\nSecond.\n\nThird.";
    expect(stripLinkMarkers(input)).toBe("First.\n\nSecond.\n\nThird.");
  });

  it("collapses 3+ consecutive newlines to 2 (single paragraph break)", () => {
    const input = "A.\n\n\n\nB.";
    expect(stripLinkMarkers(input)).toBe("A.\n\nB.");
  });

  it("handles markers containing unusual but allowed characters", () => {
    const input = "See [LINK: drivers' tips -> Bucket 1 page] now.";
    expect(stripLinkMarkers(input)).toBe("See now.");
  });

  it("is a no-op when no markers exist", () => {
    const input = "Plain article body with no markers.";
    expect(stripLinkMarkers(input)).toBe(input);
  });
});

describe("urlForSlug", () => {
  it("builds the canonical published URL", () => {
    expect(urlForSlug("best-cdl-a-lanes")).toBe(
      "https://www.cdla.jobs/articles/best-cdl-a-lanes",
    );
  });
});
