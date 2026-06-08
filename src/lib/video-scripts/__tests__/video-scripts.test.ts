import { describe, expect, it } from "vitest";
import {
  fillLine,
  renderTemplate,
  getTemplate,
  type ResolvedVariables,
} from "@/lib/video-scripts";

const FULL_VARS: ResolvedVariables = {
  vars: {
    equipment: "reefer",
    equipment_humanized: "reefer driver",
    region: "Atlanta, GA",
    region_short: "Atlanta",
    pay_low: "$1,300",
    pay_high: "$1,900",
    pay_median: "$1,550",
    carrier_count: "7",
    home_time: "weekly",
    landing_page_url: "cdla.jobs/jobs/atlanta-reefer",
    short_url: "cdla.jobs/jobs/atlanta-reefer",
  },
  warnings: [],
};

const META = { slug: "atlanta-reefer", region: "Atlanta, GA", equipment: "Reefer" };

describe("fillLine", () => {
  it("substitutes lowercase tokens verbatim", () => {
    const { text, missing } = fillLine(
      "in [[region_short]] making [[pay_low]]",
      FULL_VARS.vars,
    );
    expect(text).toBe("in Atlanta making $1,300");
    expect(missing).toEqual([]);
  });

  it("capitalizes when the token's first letter is uppercase", () => {
    const { text } = fillLine(
      "[[Equipment_humanized]]s in [[Region_short]]",
      FULL_VARS.vars,
    );
    expect(text).toBe("Reefer drivers in Atlanta");
  });

  it("reports missing variables and leaves the token intact", () => {
    const { text, missing } = fillLine("home [[home_time]] now", {
      home_time: null,
    });
    expect(text).toBe("home [[home_time]] now");
    expect(missing).toEqual(["home_time"]);
  });
});

describe("renderTemplate", () => {
  it("renders a fully-resolved template", () => {
    const t = getTemplate("pay-focused")!;
    const r = renderTemplate(t, FULL_VARS, META);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.script.body).toContain(
        "Reefer drivers in Atlanta are making $1,300 to $1,900 a week",
      );
      expect(r.script.body).toContain("cdla.jobs/jobs/atlanta-reefer");
      // CTA carries the per-template vsrc attribution param.
      expect(r.script.body).toContain("?vsrc=atlanta-reefer__pay-focused");
      // No unresolved tokens left.
      expect(r.script.body).not.toMatch(/\[\[/);
    }
  });

  it("skips a template when a required variable is null (no fake numbers)", () => {
    const t = getTemplate("pay-focused")!;
    const noPay: ResolvedVariables = {
      vars: { ...FULL_VARS.vars, pay_low: null, pay_high: null },
      warnings: [],
    };
    const r = renderTemplate(t, noPay, META);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.skipped).toBe(true);
      expect(r.missing).toContain("pay_low");
    }
  });

  it("home-time template skips when home_time is null (OTR-only region)", () => {
    const t = getTemplate("home-time")!;
    const noHome: ResolvedVariables = {
      vars: { ...FULL_VARS.vars, home_time: null },
      warnings: [],
    };
    const r = renderTemplate(t, noHome, META);
    expect(r.ok).toBe(false);
  });

  it("compliance template renders with only short_url (low-variable)", () => {
    const t = getTemplate("compliance")!;
    const minimal: ResolvedVariables = {
      vars: { short_url: "cdla.jobs/jobs/atlanta-reefer" },
      warnings: [],
    };
    const r = renderTemplate(t, minimal, META);
    expect(r.ok).toBe(true);
  });

  it("carries pay-outlier warnings into the rendered script", () => {
    const t = getTemplate("pay-focused")!;
    const warned: ResolvedVariables = {
      vars: FULL_VARS.vars,
      warnings: ["pay_high $6,000 is above $5000 — verify before producing."],
    };
    const r = renderTemplate(t, warned, META);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.script.warnings).toHaveLength(1);
  });
});
