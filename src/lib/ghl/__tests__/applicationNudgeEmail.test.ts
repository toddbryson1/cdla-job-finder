import { describe, expect, it } from "vitest";
import { applicationNudgeEmail } from "@/lib/ghl/applicationNudgeEmail";

describe("applicationNudgeEmail", () => {
  describe("nudgeIndex = 1 (T+24h, soft)", () => {
    it("singular subject when matchCount === 1", () => {
      const r = applicationNudgeEmail({
        firstName: "Pat",
        cdlState: "GA",
        matchCount: 1,
        nudgeIndex: 1,
        appUrl: "https://www.cdla.jobs",
      });
      expect(r.subject).toMatch(/your match is waiting/i);
      // Strong-tagged in the body, so just check both pieces appear.
      expect(r.html).toMatch(/1 carrier/);
      expect(r.html).toMatch(/hiring CDL-A drivers/i);
      expect(r.html).toMatch(/See the match/);
    });

    it("plural subject + CTA copy when matchCount >= 2", () => {
      const r = applicationNudgeEmail({
        firstName: "Pat",
        cdlState: "GA",
        matchCount: 4,
        nudgeIndex: 1,
        appUrl: "https://www.cdla.jobs",
      });
      expect(r.subject).toMatch(/4 carriers are waiting/i);
      expect(r.html).toMatch(/4 carriers/);
      expect(r.html).toMatch(/See your matches/);
    });

    it("voice: low-pressure, mentions 2-3 apps pattern", () => {
      const r = applicationNudgeEmail({
        firstName: "Pat",
        cdlState: "GA",
        matchCount: 4,
        nudgeIndex: 1,
        appUrl: "https://www.cdla.jobs",
      });
      expect(r.html).toMatch(/think it over/);
      // En-dash renders as the HTML entity &ndash; in the rendered
      // body — match either form.
      expect(r.html).toMatch(/2(?:&ndash;|–|-)3 applications/);
    });
  });

  describe("nudgeIndex = 2 (T+7d, last nudge)", () => {
    it("explicitly says it's the last nudge", () => {
      const r = applicationNudgeEmail({
        firstName: "Pat",
        cdlState: "GA",
        matchCount: 4,
        nudgeIndex: 2,
        appUrl: "https://www.cdla.jobs",
      });
      expect(r.html).toMatch(/last nudge/);
      expect(r.subject).toMatch(/Still thinking it over/);
    });

    it("singular vs plural CTA copy", () => {
      const r1 = applicationNudgeEmail({
        firstName: "Pat",
        cdlState: "GA",
        matchCount: 1,
        nudgeIndex: 2,
        appUrl: "https://www.cdla.jobs",
      });
      expect(r1.html).toMatch(/Open the match/);
      const r3 = applicationNudgeEmail({
        firstName: "Pat",
        cdlState: "GA",
        matchCount: 3,
        nudgeIndex: 2,
        appUrl: "https://www.cdla.jobs",
      });
      expect(r3.html).toMatch(/Open my matches/);
    });

    it("doesn't use forbidden brand-voice tropes", () => {
      const r = applicationNudgeEmail({
        firstName: "Pat",
        cdlState: "GA",
        matchCount: 4,
        nudgeIndex: 2,
        appUrl: "https://www.cdla.jobs",
      });
      expect(r.html.toLowerCase()).not.toMatch(/guaranteed/);
      expect(r.html.toLowerCase()).not.toMatch(/exclusive offer/);
      expect(r.html.toLowerCase()).not.toMatch(/limited time/);
      expect(r.html.toLowerCase()).not.toMatch(/act now/);
    });
  });

  it("falls back to 'Hey there' when firstName is empty", () => {
    const r = applicationNudgeEmail({
      firstName: "",
      cdlState: "GA",
      matchCount: 2,
      nudgeIndex: 1,
      appUrl: "https://www.cdla.jobs",
    });
    expect(r.html).toMatch(/Hey there/);
  });

  it("escapes HTML in firstName", () => {
    const r = applicationNudgeEmail({
      firstName: "<script>",
      cdlState: "GA",
      matchCount: 2,
      nudgeIndex: 1,
      appUrl: "https://www.cdla.jobs",
    });
    expect(r.html).not.toMatch(/<script>Hey/);
    expect(r.html).toMatch(/&lt;script&gt;/);
  });

  it("CTA URL points at /login?redirect=/me so the landing is the dashboard", () => {
    const r = applicationNudgeEmail({
      firstName: "Pat",
      cdlState: "GA",
      matchCount: 2,
      nudgeIndex: 1,
      appUrl: "https://www.cdla.jobs",
    });
    expect(r.html).toContain("https://www.cdla.jobs/login?redirect=%2Fme");
  });

  it("renders the region label from cdl_state", () => {
    const r = applicationNudgeEmail({
      firstName: "Pat",
      cdlState: "TX",
      matchCount: 2,
      nudgeIndex: 1,
      appUrl: "https://www.cdla.jobs",
    });
    expect(r.html.toLowerCase()).toMatch(/texas/);
  });
});
