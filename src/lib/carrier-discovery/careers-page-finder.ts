// Given a carrier homepage URL (or anything close to one), try to
// find the page that lists their job postings. We try, in order:
//
//   1. A handful of conventional paths (/careers, /jobs, /drivers,
//      /apply, /careers/drivers, etc.) under the same origin.
//   2. Scan the homepage HTML for links whose text or href looks like
//      a careers/jobs/drivers nav.
//
// We return at most one URL — the first one that responds 200 and
// looks plausible. Callers should treat null as "couldn't find one"
// and fall back to whatever they have (Adzuna in our case).

const CONVENTIONAL_PATHS = [
  "/careers",
  "/careers/drivers",
  "/careers/driver-jobs",
  "/jobs",
  "/jobs/drivers",
  "/drivers",
  "/drive-with-us",
  "/drive-for-us",
  "/apply",
  "/apply-now",
  "/employment",
  "/cdl-jobs",
];

const LINK_TEXT_HINTS = [
  /\bcareers?\b/i,
  /\bjobs?\b/i,
  /\bdrive\s+(for|with)\s+us\b/i,
  /\bdriving\s+jobs?\b/i,
  /\bcdl\s+jobs?\b/i,
  /\bapply\s+now\b/i,
  /\bdriver\s+(jobs|opportunities|careers)\b/i,
];

const HREF_HINTS = [
  /\/careers?(\/|$|\?)/i,
  /\/jobs?(\/|$|\?)/i,
  /\/drivers?(\/|$|\?)/i,
  /\/drive[-_](for|with)[-_]us/i,
  /\/apply(\/|$|\?)/i,
  /\/employment(\/|$|\?)/i,
];

// Cross-origin host patterns that look like dedicated job boards.
// Used as a last-ditch fallback when the careers page is empty —
// e.g. heartlandexpress.com → driveheartland.com,
//      werner.com → jobs.werner.com.
const JOB_BOARD_HOST_PATTERNS = [
  /^jobs?\./i,
  /^careers?\./i,
  /^drive[-a-z]*\./i,
  /^drivers?\./i,
  /^apply\./i,
];

export interface CareersPageCandidate {
  url: string;
  source: "conventional_path" | "homepage_link";
  hint: string;
}

export interface FinderOptions {
  fetchImpl?: typeof fetch;
  /** Cap on conventional-path probes. Default 6 to stay polite. */
  maxConventionalProbes?: number;
  /** Test seam. */
  timeoutMs?: number;
}

export async function findCareersPage(
  homepageUrl: string,
  options: FinderOptions = {},
): Promise<CareersPageCandidate | null> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxProbes = options.maxConventionalProbes ?? 6;

  let homepage: URL;
  try {
    homepage = new URL(homepageUrl);
  } catch {
    return null;
  }
  homepage.search = "";
  homepage.hash = "";

  // 1) Try conventional paths under the same origin.
  for (const path of CONVENTIONAL_PATHS.slice(0, maxProbes)) {
    const candidate = new URL(path, homepage).toString();
    const ok = await probe(candidate, fetchImpl, options.timeoutMs);
    if (ok) {
      return {
        url: candidate,
        source: "conventional_path",
        hint: path,
      };
    }
  }

  // 2) Scan the homepage HTML for hinting links.
  const homepageHtml = await fetchText(
    homepage.toString(),
    fetchImpl,
    options.timeoutMs,
  );
  if (!homepageHtml) return null;

  const link = findCareersLinkInHtml(homepageHtml, homepage);
  if (link) {
    return {
      url: link.url,
      source: "homepage_link",
      hint: link.hint,
    };
  }

  return null;
}

interface LinkMatch {
  url: string;
  hint: string;
}

/**
 * Scan HTML for the strongest careers-link signal. Returns the first
 * link whose visible text OR href matches one of the hint patterns.
 *
 * Exported for tests.
 */
export function findCareersLinkInHtml(
  html: string,
  baseUrl: URL,
): LinkMatch | null {
  // Naive <a href="..."> ... </a> extractor. We don't need full HTML
  // parsing for this — false positives are fine because the caller
  // probes the URL afterward.
  const anchorRe = /<a\b([^>]*?)>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html))) {
    const attrs = m[1];
    const inner = stripTags(m[2]);
    const hrefMatch = attrs.match(/\bhref=["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    const href = hrefMatch[1].trim();
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) {
      continue;
    }

    let abs: URL;
    try {
      abs = new URL(href, baseUrl);
    } catch {
      continue;
    }
    if (abs.protocol !== "http:" && abs.protocol !== "https:") continue;

    if (LINK_TEXT_HINTS.some((re) => re.test(inner))) {
      return { url: abs.toString(), hint: `text: ${inner.slice(0, 40)}` };
    }
    if (HREF_HINTS.some((re) => re.test(abs.pathname))) {
      return { url: abs.toString(), hint: `href: ${abs.pathname}` };
    }
  }
  return null;
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Patterns that identify a URL as a per-job detail page (vs. the
// index, vs. unrelated nav). Ordered roughly by specificity — the
// match is hint-only, but more-specific patterns get fewer false
// positives.
const JOB_DETAIL_PATTERNS = [
  // /jobs/12345/some-slug — Heartland, many ATS systems
  /\/jobs?\/\d+\b/i,
  // /position/12345 — Lever, some homerolled systems
  /\/positions?\/\d+\b/i,
  // /apply/12345 — common
  /\/apply\/\d+\b/i,
  // /career/12345/, /careers/12345/
  /\/careers?\/\d+\b/i,
  // /jobs/{long-slug-with-state-or-equipment}
  /\/jobs?\/[a-z][a-z0-9-]{20,}/i,
  // /job-detail?id=12345, /openings/12345
  /\/openings?\/\d+\b/i,
];

// Anti-patterns: URLs that LOOK job-ish but are categories/filters.
const JOB_DETAIL_ANTIPATTERNS = [
  /\/category\//i,
  /\/jobs?\/?$/i, // bare /jobs page itself
  /\/jobs?\/(page|sort|filter|search|location|equipment)\b/i,
];

/**
 * Find URLs that look like individual job postings on a jobs-index
 * page. Returns a deduplicated array (preserves order). Excludes
 * external domains unless they share a recognizable carrier-portal
 * host (e.g. carrierjobs.com when the careers page is on
 * carrier.com).
 */
/**
 * Find cross-origin anchor URLs that look like dedicated job-board
 * subdomains (jobs.foo.com, drivefoo.com, careers.foo.com). Use as
 * a fallback when the careers page on the main domain is empty —
 * many carriers split their marketing site and their actual job
 * board across separate hosts.
 *
 * Returns at most 3 candidates so we don't follow too many false
 * positives.
 */
export function findJobBoardSubdomainLinks(
  html: string,
  baseUrl: URL,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const anchorRe = /<a\b([^>]*?)>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html))) {
    const hrefMatch = m[1].match(/\bhref=["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    const href = hrefMatch[1].trim();
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) {
      continue;
    }

    let abs: URL;
    try {
      abs = new URL(href, baseUrl);
    } catch {
      continue;
    }
    if (abs.protocol !== "http:" && abs.protocol !== "https:") continue;
    if (abs.host === baseUrl.host) continue; // not interested in same-host

    const host = abs.host.toLowerCase();
    if (!JOB_BOARD_HOST_PATTERNS.some((re) => re.test(host))) continue;

    const key = `${abs.protocol}//${abs.host}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(`${key}/`);
    if (out.length >= 3) break;
  }
  return out;
}

export function findJobDetailLinks(
  html: string,
  baseUrl: URL,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const anchorRe = /<a\b([^>]*?)>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html))) {
    const hrefMatch = m[1].match(/\bhref=["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    const href = hrefMatch[1].trim();
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) {
      continue;
    }

    let abs: URL;
    try {
      abs = new URL(href, baseUrl);
    } catch {
      continue;
    }
    if (abs.protocol !== "http:" && abs.protocol !== "https:") continue;

    // Same-site test: keep same registrable domain OR the base host
    // ends/starts with the candidate host (to handle e.g.
    // heartlandexpress.com → driveheartland.com — different
    // registrable domains, but we already followed an explicit link
    // to the second one, so this function is called with that as the
    // base. Different-host links here we reject).
    if (abs.host !== baseUrl.host) continue;

    if (JOB_DETAIL_ANTIPATTERNS.some((re) => re.test(abs.pathname))) {
      continue;
    }
    if (!JOB_DETAIL_PATTERNS.some((re) => re.test(abs.pathname))) {
      continue;
    }

    const normalized = abs.toString();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

async function probe(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs?: number,
): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(url, fetchImpl, timeoutMs, "HEAD");
    if (res && res.ok) return true;
    // Some servers (Cloudflare, etc.) refuse HEAD with 405; try GET.
    if (res && (res.status === 405 || res.status === 403)) {
      const get = await fetchWithTimeout(url, fetchImpl, timeoutMs, "GET");
      return Boolean(get && get.ok);
    }
    return false;
  } catch {
    return false;
  }
}

async function fetchText(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs?: number,
): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(url, fetchImpl, timeoutMs, "GET");
    if (!res || !res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function fetchWithTimeout(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number | undefined,
  method: "GET" | "HEAD",
): Promise<Response | null> {
  const controller = new AbortController();
  const t =
    timeoutMs && timeoutMs > 0
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;
  try {
    return await fetchImpl(url, {
      method,
      redirect: "follow",
      signal: controller.signal,
      headers: {
        // Identify ourselves so site owners can opt out or contact us.
        "User-Agent":
          "CDLA.jobs/1.0 (+https://www.cdla.jobs/about/crawler) carrier-discovery",
      },
    });
  } catch {
    return null;
  } finally {
    if (t) clearTimeout(t);
  }
}
