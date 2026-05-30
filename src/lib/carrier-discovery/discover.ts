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
import {
  findCareersPage,
  findJobBoardSubdomainLinks,
  findJobDetailLinks,
} from "./careers-page-finder";
import {
  extractJobPostingJsonLd,
  toDiscoveredJob,
} from "./json-ld-parser";
import type { DiscoveredJob, DiscoveryReport } from "./types";

// Polite-crawl knobs. Heartland alone has ~150 active job pages;
// without a cap a single carrier discovery could burst-request a
// site enough to trigger rate limits or upset the operator.
const MAX_JOB_DETAIL_FETCHES = 60;
const DETAIL_FETCH_CONCURRENCY = 4;

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
  /**
   * When set, skip the Adzuna company-name fallback. Use this for
   * carriers we already have direct data on (CSV imports, partner
   * feeds, JSON-LD on their own website) — aggregated Adzuna data
   * would be lower-fidelity and would conflict with the direct rows
   * on (carrier_name, external_source_id).
   */
  skipAdzunaFallback?: boolean;
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

  // Step 2b: follow job-detail links from the careers/jobs index.
  // Most carriers don't put JSON-LD on the index page itself — the
  // structured data lives on each per-job page. Heartland is the
  // canonical example: /jobs (no JSON-LD) → /jobs/{id}/{slug}
  // (full JobPosting).
  let deepJobs: DiscoveredJob[] = [];
  if (careersUrl) {
    const html = await fetchText(careersUrl, fetchImpl);
    if (html !== null) {
      const candidates = findJobDetailLinks(
        html,
        new URL(careersUrl),
      ).slice(0, MAX_JOB_DETAIL_FETCHES);
      if (candidates.length > 0) {
        deepJobs = await crawlJobDetailPages(candidates, fetchImpl);
        attempts.push({
          source: "json_ld",
          ok: deepJobs.length > 0,
          note:
            deepJobs.length > 0
              ? `followed ${candidates.length} job-detail link(s), got ${deepJobs.length} JobPosting block(s)`
              : `followed ${candidates.length} job-detail link(s), no JobPosting found on any`,
        });
      }
    }
  }

  if (deepJobs.length > 0) {
    return { attempts, jobs: deepJobs };
  }

  // Step 2c: cross-origin subdomain fallback. Many carriers split
  // marketing (foo.com) from their job board (jobs.foo.com,
  // drivefoo.com). If the careers page on the main domain came up
  // empty, look for an obvious cross-origin link pointing at a
  // dedicated jobs subdomain and re-run discovery against that.
  if (careersUrl) {
    const html = await fetchText(careersUrl, fetchImpl);
    if (html !== null) {
      const subdomains = findJobBoardSubdomainLinks(html, new URL(careersUrl));
      for (const subUrl of subdomains) {
        attempts.push({
          source: "careers_page_lookup",
          ok: true,
          note: `cross-origin subdomain candidate: ${subUrl}`,
        });

        // First try the subdomain root itself...
        let subResult = await crawlCareersUrl(subUrl, fetchImpl, attempts);
        if (subResult.length > 0) {
          return { attempts, jobs: subResult };
        }

        // ...and if that produces nothing, run the careers-page
        // finder against the subdomain so we hit its /jobs or
        // /careers path.
        const subCareers = await findCareersPage(subUrl, { fetchImpl });
        if (subCareers && subCareers.url !== subUrl) {
          attempts.push({
            source: "careers_page_lookup",
            ok: true,
            note: `subdomain careers-page: ${subCareers.source} → ${subCareers.url}`,
          });
          subResult = await crawlCareersUrl(
            subCareers.url,
            fetchImpl,
            attempts,
          );
          if (subResult.length > 0) {
            return { attempts, jobs: subResult };
          }
        }
      }
    }
  }

  // Step 3: Adzuna company-name fallback — but only when we don't
  // already have direct data on this carrier. Adzuna is third-party
  // aggregation; if we have a CSV import, partner feed, or JSON-LD
  // hit on our own crawl, that data is higher fidelity and we don't
  // want lower-fidelity Adzuna rows competing with it on the same
  // (carrier, equipment, city) match space.
  if (input.skipAdzunaFallback) {
    attempts.push({
      source: "adzuna_company",
      ok: false,
      note: "skipped — carrier already has direct data source",
    });
    return { attempts, jobs: [] };
  }

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

/**
 * Run the careers→deep-crawl flow against a single URL. Returns the
 * jobs found, and appends notes to `attempts`. Used by step 2c
 * cross-origin recursion so we can try a subdomain candidate with
 * the same logic.
 */
async function crawlCareersUrl(
  url: string,
  fetchImpl: typeof fetch,
  attempts: DiscoveryReport["attempts"],
): Promise<DiscoveredJob[]> {
  const html = await fetchText(url, fetchImpl);
  if (html === null) {
    attempts.push({
      source: "json_ld",
      ok: false,
      note: `failed to fetch subdomain ${url}`,
    });
    return [];
  }

  // Try JSON-LD on the subdomain root.
  const postings = extractJobPostingJsonLd(html);
  const direct = postings
    .map((p) => toDiscoveredJob(p, url))
    .filter((j): j is DiscoveredJob => j !== null);
  if (direct.length > 0) {
    attempts.push({
      source: "json_ld",
      ok: true,
      note: `subdomain ${url}: ${direct.length} JobPosting block(s)`,
    });
    return direct;
  }

  // Deep crawl from the subdomain.
  const candidates = findJobDetailLinks(html, new URL(url)).slice(
    0,
    MAX_JOB_DETAIL_FETCHES,
  );
  if (candidates.length === 0) {
    attempts.push({
      source: "json_ld",
      ok: false,
      note: `subdomain ${url} had no JSON-LD and no job-detail links`,
    });
    return [];
  }
  const deep = await crawlJobDetailPages(candidates, fetchImpl);
  attempts.push({
    source: "json_ld",
    ok: deep.length > 0,
    note:
      deep.length > 0
        ? `subdomain ${url}: followed ${candidates.length} detail links, got ${deep.length} job(s)`
        : `subdomain ${url}: ${candidates.length} detail links, no JSON-LD on any`,
  });
  return deep;
}

/**
 * Fetch a batch of job-detail pages in parallel (capped to
 * DETAIL_FETCH_CONCURRENCY) and aggregate every JobPosting JSON-LD
 * block from all of them. Skips pages that fail to fetch or have no
 * structured data.
 */
async function crawlJobDetailPages(
  urls: string[],
  fetchImpl: typeof fetch,
): Promise<DiscoveredJob[]> {
  const out: DiscoveredJob[] = [];
  const seenSourceIds = new Set<string>();

  for (let i = 0; i < urls.length; i += DETAIL_FETCH_CONCURRENCY) {
    const batch = urls.slice(i, i + DETAIL_FETCH_CONCURRENCY);
    const pages = await Promise.all(
      batch.map(async (url) => ({
        url,
        html: await fetchText(url, fetchImpl),
      })),
    );
    for (const { url, html } of pages) {
      if (!html) continue;
      const postings = extractJobPostingJsonLd(html);
      for (const p of postings) {
        const job = toDiscoveredJob(p, url);
        if (!job) continue;
        // Dedup across pages: the same posting often appears with
        // two JSON-LD blocks (one HTML-decorated, one plaintext).
        if (seenSourceIds.has(job.sourceId)) continue;
        seenSourceIds.add(job.sourceId);
        out.push(job);
      }
    }
  }
  return out;
}

// Cap per-fetch so a single slow carrier site can't stall the
// batch crawler. Some carrier homepages hang indefinitely waiting
// on third-party scripts; we'd rather return null + move on.
const FETCH_TIMEOUT_MS = 15_000;

async function fetchText(
  url: string,
  fetchImpl: typeof fetch,
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "CDLA.jobs/1.0 (+https://www.cdla.jobs/about/crawler) carrier-discovery",
      },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
