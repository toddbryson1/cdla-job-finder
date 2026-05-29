// Extract schema.org JobPosting blocks from a carrier careers page.
//
// Google for Jobs requires JobPosting JSON-LD to index a page (we use
// it ourselves on /job/[slug]), so most carriers who care about SEO
// include it. That makes it the highest-fidelity carrier-side data
// source we can hit without any per-carrier integration.
//
// Spec: https://schema.org/JobPosting + Google's job posting
// structured data guide. We're permissive about input — there's a
// lot of malformed JSON-LD on the open web — and refuse to silently
// pass through anything that isn't a JobPosting.

import { createHash } from "node:crypto";
import type { DiscoveredJob } from "./types";

const SCRIPT_RE =
  /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

// Equipment keywords used to GUESS equipment from a JobPosting's
// title/description. First match wins.
const EQUIPMENT_GUESS_PATTERNS: Array<[RegExp, string]> = [
  [/\breefer\b|\brefrigerated\b/i, "reefer"],
  [/\bflatbed\b|\bflat\s*bed\b/i, "flatbed"],
  [/\btanker\b|\btank\s+endorsement\b/i, "tanker"],
  [/\bcar\s*hauler\b/i, "car_hauler"],
  [/\bhazmat\b|\bhaz\s*mat\b/i, "hazmat"],
  [/\bdoubles\b|\btriples\b/i, "doubles_triples"],
  [/\bdry\s*van\b/i, "dry_van"],
];

/**
 * Find every JobPosting JSON-LD block in the given HTML. Resilient to:
 * - multiple <script> tags on the same page
 * - @graph arrays containing many @types
 * - arrays of postings at the script's top level
 *
 * Returns parsed objects in their original schema.org shape — caller
 * normalizes via toDiscoveredJob.
 */
export function extractJobPostingJsonLd(html: string): unknown[] {
  const out: unknown[] = [];
  // Reset state between calls
  SCRIPT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SCRIPT_RE.exec(html))) {
    const raw = m[1].trim();
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    collectJobPostings(parsed, out);
  }
  return out;
}

function collectJobPostings(node: unknown, out: unknown[]): void {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const item of node) collectJobPostings(item, out);
    return;
  }
  if (typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  const t = obj["@type"];
  if (
    t === "JobPosting" ||
    (Array.isArray(t) && t.includes("JobPosting"))
  ) {
    out.push(obj);
  }
  // schema.org @graph holds an array of entities with mixed @types.
  if (obj["@graph"]) {
    collectJobPostings(obj["@graph"], out);
  }
}

/**
 * Normalize a JobPosting object into our DiscoveredJob shape. Returns
 * null if the posting is missing core fields (title or apply URL).
 */
export function toDiscoveredJob(
  posting: unknown,
  pageUrl: string,
): DiscoveredJob | null {
  if (!posting || typeof posting !== "object") return null;
  const p = posting as Record<string, unknown>;

  const title = pickString(p["title"]);
  if (!title) return null;

  const applyUrl = pickApplyUrl(p, pageUrl);
  if (!applyUrl) return null;

  const description = pickString(p["description"]);
  const carrierName = pickHiringOrgName(p["hiringOrganization"]);

  const { city, state, lat, lng } = pickLocation(p["jobLocation"]);

  const { payMinWeeklyUsd, payMaxWeeklyUsd, payOriginalPeriod } = pickPay(
    p["baseSalary"],
  );

  const equipmentGuess = guessEquipment(
    `${title} ${description ?? ""}`,
  );

  const postedAt = pickDate(p["datePosted"]);

  const sourceId =
    pickIdentifier(p["identifier"]) ??
    hashId(`${title}|${city ?? ""}|${state ?? ""}|${applyUrl}`);

  return {
    source: "json_ld",
    sourceId,
    title: title.trim(),
    carrierName,
    city,
    state,
    lat,
    lng,
    equipmentGuess,
    payMinWeeklyUsd,
    payMaxWeeklyUsd,
    payOriginalPeriod,
    description: description ? description.slice(0, 4000) : null,
    applyUrl,
    postedAt,
    rawSummary: summarizeRaw(p),
  };
}

function pickString(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

function pickApplyUrl(
  p: Record<string, unknown>,
  pageUrl: string,
): string | null {
  // Google's recommended fields for apply: directApply (boolean),
  // url, or fall back to the page URL itself.
  return (
    pickString(p["url"]) ??
    pickString(p["applicationUrl"]) ??
    pageUrl
  );
}

function pickHiringOrgName(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "string") return v.trim();
  if (typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  return pickString(o["name"]);
}

function pickLocation(v: unknown): {
  city: string | null;
  state: string | null;
  lat: number | null;
  lng: number | null;
} {
  // jobLocation can be a single object or an array. We pick the
  // first one. (Multi-location postings should split into multiple
  // JobPosting blocks per Google's spec, but in practice some
  // carriers put many addresses into one.)
  const first = Array.isArray(v) ? v[0] : v;
  if (!first || typeof first !== "object") {
    return { city: null, state: null, lat: null, lng: null };
  }
  const loc = first as Record<string, unknown>;
  const address = loc["address"] as Record<string, unknown> | undefined;
  const geo = loc["geo"] as Record<string, unknown> | undefined;

  const city = address ? pickString(address["addressLocality"]) : null;
  const state = address ? normalizeState(pickString(address["addressRegion"])) : null;
  const lat = geo ? toNum(geo["latitude"]) : null;
  const lng = geo ? toNum(geo["longitude"]) : null;

  return { city, state, lat, lng };
}

function pickPay(v: unknown): {
  payMinWeeklyUsd: number | null;
  payMaxWeeklyUsd: number | null;
  payOriginalPeriod: string | null;
} {
  if (!v || typeof v !== "object") {
    return { payMinWeeklyUsd: null, payMaxWeeklyUsd: null, payOriginalPeriod: null };
  }
  const o = v as Record<string, unknown>;
  const currency = pickString(o["currency"]) ?? "USD";
  if (currency !== "USD") {
    return { payMinWeeklyUsd: null, payMaxWeeklyUsd: null, payOriginalPeriod: null };
  }
  const value = o["value"];
  if (!value || typeof value !== "object") {
    return { payMinWeeklyUsd: null, payMaxWeeklyUsd: null, payOriginalPeriod: null };
  }
  const qv = value as Record<string, unknown>;
  const period = pickString(qv["unitText"])?.toUpperCase() ?? null;
  const min = toNum(qv["minValue"]);
  const max = toNum(qv["maxValue"]);
  const flat = toNum(qv["value"]);

  const toWeekly = (n: number | null): number | null => {
    if (n == null) return null;
    switch (period) {
      case "WEEK":
        return Math.round(n);
      case "HOUR":
        return Math.round(n * 40);
      case "DAY":
        return Math.round(n * 5);
      case "MONTH":
        return Math.round(n / 4.33);
      case "YEAR":
        return Math.round(n / 50);
      default:
        // Heuristic when unitText missing: > 30k = annual, > 1k = weekly, else hourly
        if (n >= 30000) return Math.round(n / 50);
        if (n >= 500) return Math.round(n);
        return Math.round(n * 40);
    }
  };

  return {
    payMinWeeklyUsd: toWeekly(min ?? flat),
    payMaxWeeklyUsd: toWeekly(max ?? flat),
    payOriginalPeriod: period,
  };
}

function pickIdentifier(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  return pickString(o["value"]);
}

function pickDate(v: unknown): Date | null {
  if (typeof v !== "string") return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(/[^\d.-]/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function hashId(input: string): string {
  return createHash("sha1").update(input).digest("hex").slice(0, 16);
}

function summarizeRaw(p: Record<string, unknown>): string {
  // Tiny one-line summary of what we got. Helps spot-check in the CLI.
  const t = p["title"];
  const o = p["hiringOrganization"];
  const orgName = typeof o === "object" && o
    ? (o as Record<string, unknown>)["name"]
    : o;
  return `${typeof t === "string" ? t : "?"} @ ${typeof orgName === "string" ? orgName : "?"}`;
}

export function guessEquipment(text: string): string | null {
  for (const [re, tag] of EQUIPMENT_GUESS_PATTERNS) {
    if (re.test(text)) return tag;
  }
  return null;
}

function normalizeState(raw: string | null): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (t.length === 2 && /^[A-Z]{2}$/i.test(t)) return t.toUpperCase();
  const abbr = US_STATE_NAME_TO_ABBR[t.toLowerCase()];
  return abbr ?? null;
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

// Exported for tests.
export const __test__ = {
  pickLocation,
  pickPay,
  normalizeState,
};
