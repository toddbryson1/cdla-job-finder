import { describe, expect, it } from "vitest";
import {
  buildFailureBody,
  buildFailureSubject,
  buildReportBody,
  buildReportSubject,
  type ReportInput,
} from "../email-report";

const baseInput: ReportInput = {
  dateYmd: "2026-05-27",
  dailyCount: 1,
  status: "SUCCESS",
  published: [
    {
      title: "Best CDL-A lanes",
      publishedUrl: "https://cdla.jobs/articles/best-cdl-a-lanes",
      bucket: 1,
      wordCount: 1024,
      reviewFlags: "",
    },
  ],
  failed: [],
  gsc: {
    configured: false,
    pendingAt3DaysOrMore: 0,
    pendingAt7DaysOrMore: 0,
  },
  killSwitchEnabled: true,
};

describe("buildReportSubject", () => {
  it("includes date and counts", () => {
    expect(buildReportSubject(baseInput)).toBe(
      "CDLA.jobs daily content report — 2026-05-27 — 1 published, 0 failed",
    );
  });

  it("counts published vs failed", () => {
    const input: ReportInput = {
      ...baseInput,
      published: [...baseInput.published, baseInput.published[0]],
      failed: [{ title: "X", bucket: 2, reason: "validation" }],
    };
    expect(buildReportSubject(input)).toContain("2 published, 1 failed");
  });
});

describe("buildReportBody", () => {
  it("renders the section structure per spec §6", () => {
    const body = buildReportBody(baseInput);
    expect(body).toContain("Date: 2026-05-27");
    expect(body).toContain("Daily count config: 1");
    expect(body).toContain("Status: SUCCESS");
    expect(body).toContain("PUBLISHED (1):");
    expect(body).toContain(" - Best CDL-A lanes");
    expect(body).toContain(
      "   URL: https://cdla.jobs/articles/best-cdl-a-lanes",
    );
    expect(body).toContain("   Bucket: 1 — Pay & Money");
    expect(body).toContain("   Word count: 1024");
    expect(body).toContain("   Review flags: none");
    expect(body).toContain("FAILED (0):");
    expect(body).toContain("  (none)");
    expect(body).toContain("GSC index status: not configured");
    expect(body).toContain("Machine kill switch: enabled");
  });

  it("renders review flags verbatim when present", () => {
    const input: ReportInput = {
      ...baseInput,
      published: [
        {
          ...baseInput.published[0],
          reviewFlags: "Check FMCSA HOS claim in paragraph 4.",
        },
      ],
    };
    const body = buildReportBody(input);
    expect(body).toContain(
      "   Review flags: Check FMCSA HOS claim in paragraph 4.",
    );
  });

  it("renders failed-article details", () => {
    const input: ReportInput = {
      ...baseInput,
      published: [],
      failed: [
        {
          title: "draft-1",
          bucket: 4,
          reason: "Placeholder rewrite failed after 1 retry",
        },
      ],
    };
    const body = buildReportBody(input);
    expect(body).toContain("PUBLISHED (0):");
    expect(body).toContain("  (none)");
    expect(body).toContain("FAILED (1):");
    expect(body).toContain(" - draft-1");
    expect(body).toContain("   Bucket: 4");
    expect(body).toContain(
      "   Reason: Placeholder rewrite failed after 1 retry",
    );
  });

  it("shows real GSC counts when configured", () => {
    const input: ReportInput = {
      ...baseInput,
      gsc: {
        configured: true,
        pendingAt3DaysOrMore: 3,
        pendingAt7DaysOrMore: 1,
      },
    };
    const body = buildReportBody(input);
    expect(body).toContain(
      "GSC index status: 3 pending at 3+ days, 1 pending at 7+ days",
    );
  });
});

describe("buildFailureSubject + buildFailureBody", () => {
  it("subject matches spec", () => {
    expect(
      buildFailureSubject({ dateYmd: "2026-05-27", error: "boom" }),
    ).toBe("CDLA.jobs content machine — RUN FAILED — 2026-05-27");
  });

  it("body includes error message and stack", () => {
    const err = new Error("DB down");
    err.stack = "Error: DB down\n  at runContentMachine";
    const body = buildFailureBody({ dateYmd: "2026-05-27", error: err });
    expect(body).toContain("Date: 2026-05-27");
    expect(body).toContain("Error: DB down");
    expect(body).toContain("at runContentMachine");
  });

  it("handles string errors without stack", () => {
    const body = buildFailureBody({ dateYmd: "2026-05-27", error: "x" });
    expect(body).toContain("Error: x");
    expect(body).toContain("(no stack available)");
  });
});
