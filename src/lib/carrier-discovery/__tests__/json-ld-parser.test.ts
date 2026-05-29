import { describe, expect, it } from "vitest";
import {
  __test__,
  extractJobPostingJsonLd,
  guessEquipment,
  toDiscoveredJob,
} from "@/lib/carrier-discovery/json-ld-parser";

const { pickLocation, pickPay, normalizeState } = __test__;

describe("extractJobPostingJsonLd", () => {
  it("finds a single JobPosting block", () => {
    const html = `
      <html><head>
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "JobPosting",
        "title": "Class A CDL Driver",
        "url": "https://example.com/job/1"
      }
      </script>
      </head></html>`;
    const out = extractJobPostingJsonLd(html);
    expect(out.length).toBe(1);
    expect((out[0] as { title: string }).title).toBe("Class A CDL Driver");
  });

  it("finds multiple JobPosting blocks on the same page", () => {
    const html = `
      <script type="application/ld+json">
      {"@type": "JobPosting", "title": "A"}
      </script>
      <script type="application/ld+json">
      {"@type": "JobPosting", "title": "B"}
      </script>`;
    expect(extractJobPostingJsonLd(html).length).toBe(2);
  });

  it("extracts JobPostings from a @graph array", () => {
    const html = `
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@graph": [
          {"@type": "Organization", "name": "Carrier"},
          {"@type": "JobPosting", "title": "Driver 1"},
          {"@type": "JobPosting", "title": "Driver 2"}
        ]
      }
      </script>`;
    const out = extractJobPostingJsonLd(html);
    expect(out.length).toBe(2);
    expect((out[0] as { title: string }).title).toBe("Driver 1");
  });

  it("handles array-of-postings at script root", () => {
    const html = `
      <script type="application/ld+json">
      [
        {"@type": "JobPosting", "title": "Driver 1"},
        {"@type": "JobPosting", "title": "Driver 2"},
        {"@type": "WebSite", "name": "ignored"}
      ]
      </script>`;
    expect(extractJobPostingJsonLd(html).length).toBe(2);
  });

  it("ignores non-JobPosting types", () => {
    const html = `
      <script type="application/ld+json">
      {"@type": "Organization", "name": "carrier"}
      </script>`;
    expect(extractJobPostingJsonLd(html).length).toBe(0);
  });

  it("recovers from a malformed block without crashing", () => {
    const html = `
      <script type="application/ld+json">
      { this is not valid JSON
      </script>
      <script type="application/ld+json">
      {"@type": "JobPosting", "title": "OK"}
      </script>`;
    expect(extractJobPostingJsonLd(html).length).toBe(1);
  });

  it("returns [] when no script tags present", () => {
    expect(extractJobPostingJsonLd("<html><body>hi</body></html>")).toEqual([]);
  });
});

describe("toDiscoveredJob", () => {
  const baseUrl = "https://example.com/careers";

  it("normalizes a fully-specified posting", () => {
    const posting = {
      "@type": "JobPosting",
      title: "Class A CDL Reefer Driver",
      description: "Regional reefer out of Atlanta. Home weekly.",
      hiringOrganization: { "@type": "Organization", name: "Atlanta Reefer Co" },
      identifier: { "@type": "PropertyValue", value: "ARC-001" },
      jobLocation: {
        "@type": "Place",
        address: {
          "@type": "PostalAddress",
          addressLocality: "Atlanta",
          addressRegion: "GA",
        },
        geo: { latitude: 33.749, longitude: -84.388 },
      },
      baseSalary: {
        "@type": "MonetaryAmount",
        currency: "USD",
        value: {
          "@type": "QuantitativeValue",
          minValue: 1200,
          maxValue: 1800,
          unitText: "WEEK",
        },
      },
      datePosted: "2026-05-15",
      url: "https://example.com/apply/ARC-001",
    };
    const job = toDiscoveredJob(posting, baseUrl);
    expect(job).not.toBeNull();
    expect(job!.title).toBe("Class A CDL Reefer Driver");
    expect(job!.carrierName).toBe("Atlanta Reefer Co");
    expect(job!.city).toBe("Atlanta");
    expect(job!.state).toBe("GA");
    expect(job!.lat).toBe(33.749);
    expect(job!.lng).toBe(-84.388);
    expect(job!.equipmentGuess).toBe("reefer");
    expect(job!.payMinWeeklyUsd).toBe(1200);
    expect(job!.payMaxWeeklyUsd).toBe(1800);
    expect(job!.payOriginalPeriod).toBe("WEEK");
    expect(job!.applyUrl).toBe("https://example.com/apply/ARC-001");
    expect(job!.sourceId).toBe("ARC-001");
    expect(job!.postedAt).toEqual(new Date("2026-05-15"));
  });

  it("returns null when title is missing", () => {
    expect(toDiscoveredJob({ "@type": "JobPosting", url: "x" }, baseUrl)).toBeNull();
  });

  it("falls back to page URL when no apply URL on posting", () => {
    const job = toDiscoveredJob(
      { "@type": "JobPosting", title: "Driver" },
      baseUrl,
    );
    expect(job!.applyUrl).toBe(baseUrl);
  });

  it("hashes an id when none is provided", () => {
    const a = toDiscoveredJob(
      {
        "@type": "JobPosting",
        title: "Driver",
        jobLocation: {
          address: { addressLocality: "Atlanta", addressRegion: "GA" },
        },
      },
      baseUrl,
    );
    const b = toDiscoveredJob(
      {
        "@type": "JobPosting",
        title: "Driver",
        jobLocation: {
          address: { addressLocality: "Atlanta", addressRegion: "GA" },
        },
      },
      baseUrl,
    );
    expect(a!.sourceId).toBe(b!.sourceId); // deterministic
    expect(a!.sourceId.length).toBe(16);
  });

  it("clips description to 4000 chars", () => {
    const long = "x".repeat(8000);
    const job = toDiscoveredJob(
      { "@type": "JobPosting", title: "Driver", description: long },
      baseUrl,
    );
    expect(job!.description!.length).toBe(4000);
  });
});

describe("pickPay — unit conversion", () => {
  it("WEEK passes through", () => {
    const out = pickPay({
      currency: "USD",
      value: { minValue: 1100, maxValue: 1500, unitText: "WEEK" },
    });
    expect(out.payMinWeeklyUsd).toBe(1100);
    expect(out.payMaxWeeklyUsd).toBe(1500);
  });

  it("HOUR multiplies by 40", () => {
    const out = pickPay({
      currency: "USD",
      value: { minValue: 25, maxValue: 35, unitText: "HOUR" },
    });
    expect(out.payMinWeeklyUsd).toBe(1000);
    expect(out.payMaxWeeklyUsd).toBe(1400);
  });

  it("YEAR divides by 50", () => {
    const out = pickPay({
      currency: "USD",
      value: { minValue: 60000, maxValue: 90000, unitText: "YEAR" },
    });
    expect(out.payMinWeeklyUsd).toBe(1200);
    expect(out.payMaxWeeklyUsd).toBe(1800);
  });

  it("MONTH divides by 4.33", () => {
    const out = pickPay({
      currency: "USD",
      value: { value: 5200, unitText: "MONTH" },
    });
    expect(out.payMinWeeklyUsd).toBe(1201); // 5200/4.33 ≈ 1200.92
  });

  it("returns nulls for non-USD currency", () => {
    const out = pickPay({
      currency: "EUR",
      value: { minValue: 1200, unitText: "WEEK" },
    });
    expect(out.payMinWeeklyUsd).toBe(null);
  });

  it("heuristic: very large number with no unit treated as annual", () => {
    const out = pickPay({
      currency: "USD",
      value: { minValue: 60000, maxValue: 90000 },
    });
    expect(out.payMinWeeklyUsd).toBe(1200);
    expect(out.payMaxWeeklyUsd).toBe(1800);
  });

  it("heuristic: small number with no unit treated as hourly", () => {
    const out = pickPay({
      currency: "USD",
      value: { value: 25 },
    });
    expect(out.payMinWeeklyUsd).toBe(1000);
  });
});

describe("pickLocation", () => {
  it("picks first when jobLocation is an array", () => {
    const out = pickLocation([
      { address: { addressLocality: "A", addressRegion: "GA" } },
      { address: { addressLocality: "B", addressRegion: "TX" } },
    ]);
    expect(out.city).toBe("A");
    expect(out.state).toBe("GA");
  });

  it("handles missing geo block", () => {
    const out = pickLocation({
      address: { addressLocality: "Dallas", addressRegion: "Texas" },
    });
    expect(out.city).toBe("Dallas");
    expect(out.state).toBe("TX");
    expect(out.lat).toBe(null);
  });
});

describe("normalizeState", () => {
  it("uppercases 2-letter codes", () => {
    expect(normalizeState("ga")).toBe("GA");
    expect(normalizeState("TX")).toBe("TX");
  });
  it("expands full names", () => {
    expect(normalizeState("Texas")).toBe("TX");
    expect(normalizeState("new york")).toBe("NY");
  });
  it("returns null for garbage", () => {
    expect(normalizeState("Mars")).toBe(null);
    expect(normalizeState(null)).toBe(null);
  });
});

describe("guessEquipment", () => {
  it("detects each equipment type", () => {
    expect(guessEquipment("CDL A Reefer driver")).toBe("reefer");
    expect(guessEquipment("OTR Flatbed")).toBe("flatbed");
    expect(guessEquipment("Tanker driver wanted")).toBe("tanker");
    expect(guessEquipment("Car hauler position")).toBe("car_hauler");
    expect(guessEquipment("Hazmat endorsement required")).toBe("hazmat");
    expect(guessEquipment("Doubles experience preferred")).toBe(
      "doubles_triples",
    );
    expect(guessEquipment("Dry van fleet")).toBe("dry_van");
  });
  it("returns null when no signal", () => {
    expect(guessEquipment("CDL A driver — home weekly")).toBe(null);
  });
});
