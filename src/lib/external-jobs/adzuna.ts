// Adzuna API client.
//
// Adzuna's free tier is 1,000 calls/month — generous if we cache. The
// search endpoint takes a freeform `what` keyword and a `where` (city,
// zip, or state) with a `distance` in kilometers, plus an optional
// category filter. We're going to be picky about the response: their
// "Logistics & Warehouse" category mixes truck driving with warehouse
// pickers and forklift jobs, so we post-filter on title keywords to
// keep only Class A driving roles.
//
// Docs: https://developer.adzuna.com/docs/search
//
// Env vars (graceful-degrade — if either is missing the search
// function returns []):
//   ADZUNA_APP_ID
//   ADZUNA_APP_KEY

import type { ExternalJobListing } from "./types";

const ADZUNA_BASE = "https://api.adzuna.com/v1/api/jobs/us/search/1";
const CATEGORY = "logistics-warehouse-jobs";
const RESULTS_PER_PAGE = 50; // Adzuna's max

// Title-keyword whitelist. A response title must contain at least one
// of these tokens to be kept. Excludes warehouse/forklift/yard roles.
const CDL_TITLE_TOKENS = [
  "cdl",
  "class a",
  "class-a",
  "truck driver",
  "tractor trailer",
  "tractor-trailer",
  "otr driver",
  "owner operator",
  "owner-operator",
  "regional driver",
  "dedicated driver",
  "team driver",
  "company driver",
];

const TITLE_EXCLUDE_TOKENS = [
  "warehouse",
  "forklift",
  "yard jockey",
  "yard hostler",
  "package handler",
  "delivery helper",
  "non-cdl",
  "non cdl",
  "class b",
  "class-b",
  "class c",
  "delivery driver", // most are non-CDL local delivery
];

// Equipment → keyword fragment to inject into the `what` query.
// Falls back to "CDL A driver" when the equipment is unknown.
const EQUIPMENT_TO_QUERY: Record<string, string> = {
  reefer: "CDL A reefer",
  refrigerated: "CDL A reefer",
  flatbed: "CDL A flatbed",
  dry_van: "CDL A van",
  van: "CDL A van",
  tanker: "CDL A tanker",
  car_hauler: "CDL A car hauler",
  hazmat: "CDL A hazmat",
  doubles_triples: "CDL A doubles",
  doubles: "CDL A doubles",
};

// Equipment keywords to look for in a title to GUESS the equipment of
// an inbound listing. First match wins. Used only for display.
const EQUIPMENT_GUESS_PATTERNS: Array<[RegExp, string]> = [
  [/\breefer\b|\brefrigerated\b/i, "reefer"],
  [/\bflatbed\b|\bflat\s*bed\b/i, "flatbed"],
  [/\btanker\b|\btank\b/i, "tanker"],
  [/\bcar\s*hauler\b/i, "car_hauler"],
  [/\bhazmat\b|\bhaz\s*mat\b/i, "hazmat"],
  [/\bdoubles\b|\btriples\b/i, "doubles_triples"],
  [/\bdry\s*van\b|\bvan\b/i, "dry_van"],
];

interface AdzunaResult {
  id: string;
  title: string;
  description?: string;
  company?: { display_name?: string };
  location?: { display_name?: string; area?: string[] };
  salary_min?: number;
  salary_max?: number;
  salary_is_predicted?: string;
  redirect_url: string;
  created?: string;
  latitude?: number;
  longitude?: number;
}

interface AdzunaSearchResponse {
  results?: AdzunaResult[];
}

export interface AdzunaQuery {
  /** Driver's home latitude. */
  lat: number;
  /** Driver's home longitude. */
  lng: number;
  /** Search radius in miles. Use a large value (e.g. 10000) when "anywhere". */
  radiusMiles: number;
  /** Driver's desired equipment array — first entry seeds the keyword. */
  desiredEquipment: string[];
  /** Driver's minimum weekly pay in USD; converted to annual for Adzuna. */
  minWeeklyPayUsd: number;
  /** Cap the response. Adzuna max is 50. */
  limit?: number;
  /** Test seam. */
  fetchImpl?: typeof fetch;
}

export function isAdzunaConfigured(): boolean {
  return Boolean(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY);
}

/**
 * Hit Adzuna's search endpoint and return CDL-filtered listings. If
 * the env vars aren't set, returns []. Network/parse errors are
 * logged and return [] — the caller shouldn't crash if Adzuna is down.
 */
export async function searchAdzuna(
  query: AdzunaQuery,
): Promise<ExternalJobListing[]> {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey) return [];

  const fetchImpl = query.fetchImpl ?? fetch;
  const what = buildKeyword(query.desiredEquipment);
  const params = new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    results_per_page: String(Math.min(query.limit ?? RESULTS_PER_PAGE, 50)),
    what,
    where: `${query.lat.toFixed(4)},${query.lng.toFixed(4)}`,
    distance: String(Math.round(query.radiusMiles * 1.609344)), // mi → km
    category: CATEGORY,
    sort_by: "date",
    max_days_old: "30",
    "content-type": "application/json",
  });
  if (query.minWeeklyPayUsd > 0) {
    // Annual proxy: 50 weeks/year (conservative — leaves room for time off).
    params.set("salary_min", String(query.minWeeklyPayUsd * 50));
  }

  const url = `${ADZUNA_BASE}?${params.toString()}`;

  let json: AdzunaSearchResponse;
  try {
    const res = await fetchImpl(url);
    if (!res.ok) {
      console.error(
        `[adzuna] search failed: ${res.status} ${res.statusText}`,
      );
      return [];
    }
    json = (await res.json()) as AdzunaSearchResponse;
  } catch (err) {
    console.error("[adzuna] network/parse error:", err);
    return [];
  }

  const results = json.results ?? [];
  return results
    .map(toListing)
    .filter((l): l is ExternalJobListing => l !== null);
}

function buildKeyword(desiredEquipment: string[]): string {
  for (const eq of desiredEquipment) {
    const mapped = EQUIPMENT_TO_QUERY[eq.toLowerCase()];
    if (mapped) return mapped;
  }
  return "CDL A driver";
}

function toListing(r: AdzunaResult): ExternalJobListing | null {
  if (!r || !r.id || !r.title || !r.redirect_url) return null;

  const titleLc = r.title.toLowerCase();
  if (!CDL_TITLE_TOKENS.some((t) => titleLc.includes(t))) return null;
  if (TITLE_EXCLUDE_TOKENS.some((t) => titleLc.includes(t))) return null;

  const { city, state } = parseLocation(r.location);

  return {
    source: "adzuna",
    sourceId: r.id,
    title: r.title.trim(),
    companyName: r.company?.display_name?.trim() ?? null,
    city,
    state,
    lat: r.latitude ?? null,
    lng: r.longitude ?? null,
    equipmentGuess: guessEquipment(`${r.title} ${r.description ?? ""}`),
    salaryMinAnnualUsd:
      typeof r.salary_min === "number" ? Math.round(r.salary_min) : null,
    salaryMaxAnnualUsd:
      typeof r.salary_max === "number" ? Math.round(r.salary_max) : null,
    salaryIsPredicted: r.salary_is_predicted === "1",
    descriptionExcerpt: r.description?.trim().slice(0, 500) ?? null,
    redirectUrl: r.redirect_url,
    postedAt: r.created ? new Date(r.created) : null,
  };
}

/** Adzuna's `location.area` is like ["US", "Texas", "Dallas County", "Dallas"]. */
export function parseLocation(
  loc: { display_name?: string; area?: string[] } | undefined,
): { city: string | null; state: string | null } {
  if (!loc) return { city: null, state: null };
  const area = loc.area ?? [];

  // State: prefer a 2-letter abbrev that's actually a US state code;
  // otherwise convert the full name. We have to validate against the
  // known set so that the leading "US" entry isn't picked as state.
  const validAbbrs = new Set(Object.values(US_STATE_NAME_TO_ABBR));
  let state: string | null = null;
  for (const entry of area) {
    if (entry.length === 2 && /^[A-Z]{2}$/.test(entry) && validAbbrs.has(entry)) {
      state = entry;
      break;
    }
  }
  if (!state) {
    for (const entry of area) {
      const abbr = US_STATE_NAME_TO_ABBR[entry.toLowerCase()];
      if (abbr) {
        state = abbr;
        break;
      }
    }
  }

  // City: take the last area entry that isn't the state or country.
  // Adzuna usually puts the most specific locality at the end.
  let city: string | null = null;
  for (let i = area.length - 1; i >= 0; i--) {
    const entry = area[i];
    if (
      entry === "US" ||
      entry.toLowerCase() === "united states" ||
      entry === state ||
      US_STATE_NAME_TO_ABBR[entry.toLowerCase()] ||
      /county$/i.test(entry)
    ) {
      continue;
    }
    city = entry;
    break;
  }

  return { city, state };
}

export function guessEquipment(text: string): string | null {
  for (const [re, tag] of EQUIPMENT_GUESS_PATTERNS) {
    if (re.test(text)) return tag;
  }
  return null;
}

const US_STATE_NAME_TO_ABBR: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR",
  california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE",
  florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID",
  illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS",
  kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
  missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM",
  "new york": "NY", "north carolina": "NC", "north dakota": "ND",
  ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA",
  "rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
  tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV",
  wisconsin: "WI", wyoming: "WY",
  "district of columbia": "DC",
};

export interface AdzunaCompanyQuery {
  companyName: string;
  /** Cap on results. Adzuna max is 50. */
  limit?: number;
  /** Optional, restricts to the given state if provided. */
  state?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Search Adzuna for CDL postings explicitly attributed to a company.
 * Used by carrier-discovery as a fallback when a carrier's own
 * careers page doesn't expose JSON-LD.
 *
 * We use Adzuna's `company` param when supplied (some accounts have
 * it via `what_or` syntax). To be safe, we encode the company name
 * into `what_phrase` so all returned postings mention that exact
 * phrase somewhere — then post-filter the response so we only keep
 * rows whose `company.display_name` matches the requested name with
 * decent fuzz tolerance.
 */
export async function searchAdzunaByCompany(
  query: AdzunaCompanyQuery,
): Promise<ExternalJobListing[]> {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey) return [];

  const fetchImpl = query.fetchImpl ?? fetch;
  const params = new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    results_per_page: String(Math.min(query.limit ?? 50, 50)),
    what_and: "CDL driver",
    what_phrase: query.companyName,
    category: CATEGORY,
    sort_by: "date",
    max_days_old: "60",
    "content-type": "application/json",
  });
  if (query.state) {
    params.set("where", query.state);
  }

  const url = `${ADZUNA_BASE}?${params.toString()}`;
  let json: AdzunaSearchResponse;
  try {
    const res = await fetchImpl(url);
    if (!res.ok) {
      console.error(
        `[adzuna] company search failed: ${res.status} ${res.statusText}`,
      );
      return [];
    }
    json = (await res.json()) as AdzunaSearchResponse;
  } catch (err) {
    console.error("[adzuna] company search network error:", err);
    return [];
  }

  const wantedNorm = normalizeName(query.companyName);
  const results = json.results ?? [];
  return results
    .filter((r) => {
      const got = normalizeName(r.company?.display_name ?? "");
      // Both directions: handle "Heartland" vs "Heartland Express".
      return got.includes(wantedNorm) || wantedNorm.includes(got);
    })
    .map(toListing)
    .filter((l): l is ExternalJobListing => l !== null);
}

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(inc|llc|corp|corporation|company|co|ltd|usa)\b/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

// Exported for tests.
export const __test__ = {
  buildKeyword,
  toListing,
  normalizeName,
};
