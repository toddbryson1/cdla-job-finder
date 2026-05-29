// Orchestrator: given a carrier (name + homepage URL), try to
// produce a list of DiscoveredJob rows. Logs every attempt so the
// caller can show a transparent "we tried X, got Y" report.
//
// Order of operations:
//   1. Try the careers-page finder to locate the URL listing their
//      openings. If the caller passed `careersUrl` directly we skip
//      this.
//   2. Fetch the careers page HTML and parse any JobPosting JSON-LD.
//   3. If JSON-LD returned zero postings, fall back to Adzuna's
//      company-name search.
//
// All steps degrade gracefully — a network failure at any step
// produces an attempt log entry and we try the next step.

import { searchAdzunaByCompany } from "@/lib/external-jobs/adzuna";
import { findCareersPage } from "./careers-page-finder";
import {
  extractJobPostingJsonLd,
  toDiscoveredJob,
} from "./json-ld-parser";
import type { DiscoveredJob, DiscoveryReport } from "./types";

export interface DiscoverCarrierInput {
  /** Display name. Used for the Adzuna fallback. */
  name: string;
  /**
   * Homepage URL. We'll look for the careers page from here unless
   * `careersUrl` is provided.
   */
  homepageUrl: string;
  /** If you already know the careers URL, pass it to skip the finder. */
  careersUrl?: string;
  fetchImpl?: typeof fetch;
}

export async function discoverCarrierJobs(
  input: DiscoverCarrierInput,
): Promise<DiscoveryReport> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const attempts: DiscoveryReport["attempts"] = [];

  // Step 1: find the careers page if not supplied.
  let careersUrl = input.careersUrl ?? null;
  if (!careersUrl) {
    const found = await findCareersPage(input.homepageUrl, { fetchImpl });
    if (found) {
      careersUrl = found.url;
      attempts.push({
        source: "careers_page_lookup",
        ok: true,
        note: `${found.source}: ${found.hint} → ${found.url}`,
      });
    } else {
      attempts.push({
        source: "careers_page_lookup",
        ok: false,
        note: "no conventional path or homepage link found",
      });
    }
  }

  // Step 2: parse JSON-LD on the careers page (if we have one).
  let jsonLdJobs: DiscoveredJob[] = [];
  if (careersUrl) {
    const html = await fetchText(careersUrl, fetchImpl);
    if (html === null) {
      attempts.push({
        source: "json_ld",
        ok: false,
        note: `failed to fetch ${careersUrl}`,
      });
    } else {
      const postings = extractJobPostingJsonLd(html);
      jsonLdJobs = postings
        .map((p) => toDiscoveredJob(p, careersUrl!))
        .filter((j): j is DiscoveredJob => j !== null);
      attempts.push({
        source: "json_ld",
        ok: jsonLdJobs.length > 0,
        note:
          jsonLdJobs.length > 0
            ? `parsed ${jsonLdJobs.length} JobPosting block(s) from ${careersUrl}`
            : `no JobPosting JSON-LD found on ${careersUrl}`,
      });
    }
  }

  if (jsonLdJobs.length > 0) {
    return { attempts, jobs: jsonLdJobs };
  }

  // Step 3: Adzuna company-name fallback.
  const adzunaListings = await searchAdzunaByCompany({
    companyName: input.name,
    fetchImpl,
  });
  attempts.push({
    source: "adzuna_company",
    ok: adzunaListings.length > 0,
    note:
      adzunaListings.length > 0
        ? `found ${adzunaListings.length} matching listings for "${input.name}" via Adzuna`
        : `no Adzuna matches for "${input.name}" (or ADZUNA creds missing)`,
  });

  const adzunaJobs: DiscoveredJob[] = adzunaListings.map((l) => ({
    source: "adzuna_company",
    sourceId: l.sourceId,
    title: l.title,
    carrierName: l.companyName,
    city: l.city,
    state: l.state,
    lat: l.lat,
    lng: l.lng,
    equipmentGuess: l.equipmentGuess,
    payMinWeeklyUsd:
      l.salaryMinAnnualUsd == null
        ? null
        : Math.round(l.salaryMinAnnualUsd / 50),
    payMaxWeeklyUsd:
      l.salaryMaxAnnualUsd == null
        ? null
        : Math.round(l.salaryMaxAnnualUsd / 50),
    payOriginalPeriod: "YEAR",
    description: l.descriptionExcerpt,
    applyUrl: l.redirectUrl,
    postedAt: l.postedAt,
    rawSummary: `${l.title} @ ${l.companyName ?? "?"} (adzuna)`,
  }));

  return { attempts, jobs: adzunaJobs };
}

async function fetchText(
  url: string,
  fetchImpl: typeof fetch,
): Promise<string | null> {
  try {
    const res = await fetchImpl(url, {
      redirect: "follow",
      headers: {
        "User-Agent":
          "CDLA.jobs/1.0 (+https://www.cdla.jobs/about/crawler) carrier-discovery",
      },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}
