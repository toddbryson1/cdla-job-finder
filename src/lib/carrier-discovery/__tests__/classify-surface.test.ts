import { describe, expect, it } from "vitest";
import { classifyApplicationSurface } from "@/lib/carrier-discovery/classify-surface";

describe("classifyApplicationSurface — Tenstreet detection", () => {
  it("classifies tenstreet.com as tenstreet_intelliapp", () => {
    expect(
      classifyApplicationSurface({
        applyUrl: "https://tenstreet.com/apply/foo",
      }).surface,
    ).toBe("tenstreet_intelliapp");
  });

  it("classifies intelliapp.driverapponline.com as tenstreet_intelliapp", () => {
    expect(
      classifyApplicationSurface({
        applyUrl: "https://intelliapp.driverapponline.com/c/heartlandexpress",
      }).surface,
    ).toBe("tenstreet_intelliapp");
  });

  it("classifies careers.driverreach.com as tenstreet_intelliapp", () => {
    expect(
      classifyApplicationSurface({
        applyUrl: "https://careers.driverreach.com/x",
      }).surface,
    ).toBe("tenstreet_intelliapp");
  });

  it("classifies a deep subdomain of tenstreet.com", () => {
    expect(
      classifyApplicationSurface({
        applyUrl: "https://abc.foo.tenstreet.com/apply/x",
      }).surface,
    ).toBe("tenstreet_intelliapp");
  });
});

describe("classifyApplicationSurface — ATS detection", () => {
  it("classifies Workday as custom_intake_form", () => {
    expect(
      classifyApplicationSurface({
        applyUrl: "https://carrier.wd1.myworkdayjobs.com/Careers/job/12345",
      }).surface,
    ).toBe("custom_intake_form");
  });

  it("classifies Greenhouse boards as custom_intake_form", () => {
    expect(
      classifyApplicationSurface({
        applyUrl: "https://boards.greenhouse.io/carrier/jobs/4567",
      }).surface,
    ).toBe("custom_intake_form");
  });

  it("classifies Lever boards as custom_intake_form", () => {
    expect(
      classifyApplicationSurface({
        applyUrl: "https://jobs.lever.co/carrier/abc",
      }).surface,
    ).toBe("custom_intake_form");
  });

  it("classifies iCIMS as custom_intake_form", () => {
    expect(
      classifyApplicationSurface({
        applyUrl: "https://carrier-careers.icims.com/jobs/123",
      }).surface,
    ).toBe("custom_intake_form");
  });
});

describe("classifyApplicationSurface — mailto / tel", () => {
  it("mailto: → email_only", () => {
    expect(
      classifyApplicationSurface({
        applyUrl: "mailto:recruiting@carrier.com",
      }).surface,
    ).toBe("email_only");
  });
  it("MAILTO: case-insensitive", () => {
    expect(
      classifyApplicationSurface({ applyUrl: "MAILTO:RECRUIT@CARRIER.COM" })
        .surface,
    ).toBe("email_only");
  });
  it("tel: → phone_only", () => {
    expect(
      classifyApplicationSurface({ applyUrl: "tel:+1-800-555-0100" }).surface,
    ).toBe("phone_only");
  });
});

describe("classifyApplicationSurface — same-domain self-hosted form", () => {
  it("same-host as carrier → custom_intake_form", () => {
    expect(
      classifyApplicationSurface({
        applyUrl: "https://driveheartland.com/jobs/123",
        carrierHost: "driveheartland.com",
      }).surface,
    ).toBe("custom_intake_form");
  });

  it("www.-stripped match → custom_intake_form", () => {
    expect(
      classifyApplicationSurface({
        applyUrl: "https://carrier.com/apply/123",
        carrierHost: "www.carrier.com",
      }).surface,
    ).toBe("custom_intake_form");
  });

  it("different host (unrelated) → unknown", () => {
    expect(
      classifyApplicationSurface({
        applyUrl: "https://thirdparty.example/jobs/x",
        carrierHost: "carrier.com",
      }).surface,
    ).toBe("unknown");
  });
});

describe("classifyApplicationSurface — defensive cases", () => {
  it("empty URL → unknown", () => {
    expect(
      classifyApplicationSurface({ applyUrl: "" }).surface,
    ).toBe("unknown");
  });
  it("malformed URL → unknown", () => {
    expect(
      classifyApplicationSurface({ applyUrl: "not-a-url" }).surface,
    ).toBe("unknown");
  });
  it("javascript: protocol → unknown", () => {
    expect(
      classifyApplicationSurface({ applyUrl: "javascript:alert(1)" }).surface,
    ).toBe("unknown");
  });
  it("ftp: protocol → unknown", () => {
    expect(
      classifyApplicationSurface({ applyUrl: "ftp://carrier.com/x" }).surface,
    ).toBe("unknown");
  });
});
