import { describe, expect, it } from "vitest";
import { discoverCarrierJobs } from "@/lib/carrier-discovery/discover";

const careersHtmlWithOneJob = `
<!doctype html>
<html><head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "JobPosting",
  "title": "Class A CDL Reefer Driver — Atlanta",
  "url": "https://carrier.example/apply/r-1",
  "hiringOrganization": {"@type": "Organization", "name": "Atlanta Reefer Co"},
  "jobLocation": {
    "@type": "Place",
    "address": {"addressLocality": "Atlanta", "addressRegion": "GA"}
  },
  "baseSalary": {
    "@type": "MonetaryAmount",
    "currency": "USD",
    "value": {"@type": "QuantitativeValue", "minValue": 1200, "maxValue": 1800, "unitText": "WEEK"}
  },
  "datePosted": "2026-05-20"
}
</script>
</head></html>`;

const careersHtmlWithoutJsonLd = `
<!doctype html>
<html><head><title>Careers</title></head>
<body>
  <h1>Drive for us</h1>
  <p>We're hiring drivers in the Atlanta area. Call us!</p>
</body></html>`;

describe("discoverCarrierJobs", () => {
  it("returns JSON-LD jobs when present on the careers page", async () => {
    const fakeFetch: typeof fetch = async (input) => {
      const url =
        typeof input === "string" ? input : (input as URL).toString();
      if (url === "https://carrier.example/careers") {
        return new Response(careersHtmlWithOneJob, { status: 200 });
      }
      // First conventional-path probe (/careers) succeeds via HEAD.
      return new Response("", { status: 404 });
    };
    const report = await discoverCarrierJobs({
      name: "Atlanta Reefer Co",
      homepageUrl: "https://carrier.example",
      careersUrl: "https://carrier.example/careers",
      fetchImpl: fakeFetch,
    });
    expect(report.jobs.length).toBe(1);
    expect(report.jobs[0].title).toBe("Class A CDL Reefer Driver — Atlanta");
    expect(report.jobs[0].source).toBe("json_ld");
    expect(report.attempts.some((a) => a.source === "json_ld" && a.ok)).toBe(
      true,
    );
  });

  it("falls back to Adzuna when no JSON-LD is present", async () => {
    process.env.ADZUNA_APP_ID = "test";
    process.env.ADZUNA_APP_KEY = "test";
    try {
      const adzunaBody = {
        results: [
          {
            id: "ad-1",
            title: "Class A CDL Driver — Atlanta",
            redirect_url: "https://adzuna.example/job/ad-1",
            company: { display_name: "Atlanta Reefer Co" },
            location: { area: ["US", "GA", "Atlanta"] },
            salary_min: 60000,
            salary_max: 90000,
            salary_is_predicted: "0",
          },
        ],
      };
      const fakeFetch: typeof fetch = async (input) => {
        const url =
          typeof input === "string" ? input : (input as URL).toString();
        if (url === "https://carrier.example/careers") {
          return new Response(careersHtmlWithoutJsonLd, { status: 200 });
        }
        if (url.startsWith("https://api.adzuna.com/")) {
          return new Response(JSON.stringify(adzunaBody), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("", { status: 404 });
      };
      const report = await discoverCarrierJobs({
        name: "Atlanta Reefer Co",
        homepageUrl: "https://carrier.example",
        careersUrl: "https://carrier.example/careers",
        fetchImpl: fakeFetch,
      });
      expect(report.jobs.length).toBe(1);
      expect(report.jobs[0].source).toBe("adzuna_company");
      expect(report.attempts.find((a) => a.source === "json_ld")!.ok).toBe(
        false,
      );
      expect(
        report.attempts.find((a) => a.source === "adzuna_company")!.ok,
      ).toBe(true);
    } finally {
      delete process.env.ADZUNA_APP_ID;
      delete process.env.ADZUNA_APP_KEY;
    }
  });

  it("deep-crawls job-detail links when the index has none", async () => {
    // Index with two job-detail links, no JSON-LD itself.
    const indexHtml = `
      <html><body>
        <a href="/jobs/100/cdl-driver-atlanta">Atlanta</a>
        <a href="/jobs/200/cdl-driver-dallas">Dallas</a>
      </body></html>`;
    const detailHtml = (city: string, id: string) => `
      <html><head>
      <script type="application/ld+json">
      {
        "@type": "JobPosting",
        "title": "CDL Driver — ${city}",
        "identifier": {"@type": "PropertyValue", "value": "${id}"},
        "jobLocation": {"address": {"addressLocality": "${city}", "addressRegion": "GA"}},
        "url": "https://carrier.example/jobs/${id}/cdl-driver-${city.toLowerCase()}"
      }
      </script>
      </head></html>`;
    const fakeFetch: typeof fetch = async (input) => {
      const url =
        typeof input === "string" ? input : (input as URL).toString();
      if (url === "https://carrier.example/jobs") {
        return new Response(indexHtml, { status: 200 });
      }
      if (url === "https://carrier.example/jobs/100/cdl-driver-atlanta") {
        return new Response(detailHtml("Atlanta", "100"), { status: 200 });
      }
      if (url === "https://carrier.example/jobs/200/cdl-driver-dallas") {
        return new Response(detailHtml("Dallas", "200"), { status: 200 });
      }
      return new Response("", { status: 404 });
    };
    const report = await discoverCarrierJobs({
      name: "Test Carrier",
      homepageUrl: "https://carrier.example",
      careersUrl: "https://carrier.example/jobs",
      fetchImpl: fakeFetch,
    });
    expect(report.jobs.length).toBe(2);
    expect(report.jobs.map((j) => j.title).sort()).toEqual([
      "CDL Driver — Atlanta",
      "CDL Driver — Dallas",
    ]);
  });

  it("dedupes duplicate JSON-LD across detail pages by sourceId", async () => {
    const indexHtml = `
      <a href="/jobs/100/x">x</a>
      <a href="/jobs/100/x-copy">x copy</a>
      <a href="/jobs/200/y">y</a>`;
    const detail100 = `<script type="application/ld+json">
      {"@type":"JobPosting","title":"X","identifier":{"value":"X-100"},"url":"https://carrier.example/jobs/100/x"}
    </script>`;
    const detail200 = `<script type="application/ld+json">
      {"@type":"JobPosting","title":"Y","identifier":{"value":"Y-200"},"url":"https://carrier.example/jobs/200/y"}
    </script>`;
    const fakeFetch: typeof fetch = async (input) => {
      const url =
        typeof input === "string" ? input : (input as URL).toString();
      if (url === "https://carrier.example/jobs") {
        return new Response(indexHtml, { status: 200 });
      }
      if (url.includes("/jobs/100/")) {
        return new Response(detail100, { status: 200 });
      }
      if (url.includes("/jobs/200/")) {
        return new Response(detail200, { status: 200 });
      }
      return new Response("", { status: 404 });
    };
    const report = await discoverCarrierJobs({
      name: "Test",
      homepageUrl: "https://carrier.example",
      careersUrl: "https://carrier.example/jobs",
      fetchImpl: fakeFetch,
    });
    // Two distinct identifiers — even though one was linked twice.
    expect(report.jobs.length).toBe(2);
  });

  it("skipAdzunaFallback: short-circuits without calling Adzuna", async () => {
    process.env.ADZUNA_APP_ID = "test";
    process.env.ADZUNA_APP_KEY = "test";
    try {
      let adzunaHit = false;
      const fakeFetch: typeof fetch = async (input) => {
        const url =
          typeof input === "string" ? input : (input as URL).toString();
        if (url === "https://carrier.example/careers") {
          return new Response(careersHtmlWithoutJsonLd, { status: 200 });
        }
        if (url.startsWith("https://api.adzuna.com/")) {
          adzunaHit = true;
          return new Response(JSON.stringify({ results: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("", { status: 404 });
      };
      const report = await discoverCarrierJobs({
        name: "Already-Direct Carrier",
        homepageUrl: "https://carrier.example",
        careersUrl: "https://carrier.example/careers",
        skipAdzunaFallback: true,
        fetchImpl: fakeFetch,
      });
      expect(adzunaHit).toBe(false);
      expect(report.jobs).toEqual([]);
      const adzunaAttempt = report.attempts.find(
        (a) => a.source === "adzuna_company",
      );
      expect(adzunaAttempt?.ok).toBe(false);
      expect(adzunaAttempt?.note).toMatch(/skipped/);
    } finally {
      delete process.env.ADZUNA_APP_ID;
      delete process.env.ADZUNA_APP_KEY;
    }
  });

  it("skipAdzunaFallback still lets JSON-LD succeed", async () => {
    // We have direct partner data, but the JSON-LD path can still
    // refresh the carrier's job list with first-party data.
    const fakeFetch: typeof fetch = async (input) => {
      const url =
        typeof input === "string" ? input : (input as URL).toString();
      if (url === "https://carrier.example/careers") {
        return new Response(careersHtmlWithOneJob, { status: 200 });
      }
      return new Response("", { status: 404 });
    };
    const report = await discoverCarrierJobs({
      name: "Atlanta Reefer Co",
      homepageUrl: "https://carrier.example",
      careersUrl: "https://carrier.example/careers",
      skipAdzunaFallback: true,
      fetchImpl: fakeFetch,
    });
    expect(report.jobs.length).toBe(1);
    expect(report.jobs[0].source).toBe("json_ld");
  });

  it("returns empty jobs and explains in attempts when everything fails", async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response("nope", { status: 404 });
    const report = await discoverCarrierJobs({
      name: "Made Up Carrier",
      homepageUrl: "https://nonexistent.example",
      careersUrl: "https://nonexistent.example/careers",
      fetchImpl: fakeFetch,
    });
    expect(report.jobs).toEqual([]);
    expect(report.attempts.length).toBeGreaterThan(0);
  });

  it("filters Adzuna fallback to listings whose company name matches", async () => {
    process.env.ADZUNA_APP_ID = "test";
    process.env.ADZUNA_APP_KEY = "test";
    try {
      const adzunaBody = {
        results: [
          {
            id: "ad-1",
            title: "CDL Driver",
            redirect_url: "https://adzuna.example/1",
            company: { display_name: "Atlanta Reefer Co" },
            location: { area: ["US", "GA"] },
          },
          {
            id: "ad-2",
            title: "CDL Driver",
            redirect_url: "https://adzuna.example/2",
            company: { display_name: "Unrelated Trucking" },
            location: { area: ["US", "GA"] },
          },
        ],
      };
      const fakeFetch: typeof fetch = async (input) => {
        const url =
          typeof input === "string" ? input : (input as URL).toString();
        if (url === "https://carrier.example/careers") {
          return new Response(careersHtmlWithoutJsonLd, { status: 200 });
        }
        if (url.startsWith("https://api.adzuna.com/")) {
          return new Response(JSON.stringify(adzunaBody), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("", { status: 404 });
      };
      const report = await discoverCarrierJobs({
        name: "Atlanta Reefer Co",
        homepageUrl: "https://carrier.example",
        careersUrl: "https://carrier.example/careers",
        fetchImpl: fakeFetch,
      });
      expect(report.jobs.length).toBe(1);
      expect(report.jobs[0].carrierName).toBe("Atlanta Reefer Co");
    } finally {
      delete process.env.ADZUNA_APP_ID;
      delete process.env.ADZUNA_APP_KEY;
    }
  });
});
