// Adzuna carrier-name harvest.
//
// Adzuna indexes ~30k US CDL listings at any time. Our hand-curated
// batch-discover list only hit 25 known carriers. This script scans
// Adzuna with broad CDL keywords, groups results by
// `company.display_name`, filters out lead-gen agencies and carriers
// we already know about, and surfaces the top unknown candidates as
// next batch-discovery targets.
//
// Cost: 6 Adzuna API calls per run (~25 candidates surfaced). Well
// within the 1k/month free tier.
//
// Usage:
//   npx tsx scripts/discover-adzuna-carriers.ts
//   npx tsx scripts/discover-adzuna-carriers.ts --min-listings 3
//   npx tsx scripts/discover-adzuna-carriers.ts --pages 10

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

interface Args {
  /** Minimum listings per company to surface. Default 5. */
  minListings: number;
  /** Pages of 50 results to fetch. Default 6 = 300 listings. */
  pages: number;
  /** Print every candidate as JSON instead of human summary. */
  json: boolean;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { minListings: 5, pages: 6, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--min-listings") out.minListings = Number(argv[++i]) || 5;
    else if (a === "--pages") out.pages = Number(argv[++i]) || 6;
    else if (a === "--json") out.json = true;
  }
  return out;
}

// Keywords we cycle through to broaden coverage. Each query returns
// up to 50 results per page; together they sample different slices
// of Adzuna's CDL listings (regional, OTR, equipment-specific).
const BROAD_QUERIES = [
  "CDL A driver",
  "Class A truck driver",
  "OTR truck driver",
  "regional truck driver",
  "dedicated truck driver",
  "reefer driver",
];

// Hosts that publish bulk lead-gen postings under a single brand
// rather than the actual hiring carrier. We mark these aggregators
// in the output but still let the user see them — a noisy true is
// better than a silent false-negative on a real small fleet.
const LEAD_GEN_NAME_PATTERNS = [
  /\brecruit(er|ing|ment)?\b/i,
  /\bstaffing\b/i,
  /\btalent\b/i,
  /\blead(s)?\b/i,
  /\bagency\b/i,
  /\bopportun(ity|ities)\b/i,
  /\bplacement\b/i,
  /\bsourcing\b/i,
  /\bhire(ing)?\b/i,
  /\bcareer\b/i,
  /\bjob(s)?\b\s*$/i,
];

interface AdzunaResult {
  id: string;
  title: string;
  company?: { display_name?: string };
  location?: { area?: string[] };
  redirect_url: string;
  salary_min?: number;
  salary_max?: number;
}

interface AdzunaResponse {
  results?: AdzunaResult[];
}

interface CarrierTally {
  name: string;
  count: number;
  /** Looks like a lead-gen agency rather than the actual carrier. */
  isLikelyAggregator: boolean;
  sampleTitle: string;
  /** Sample listing's apply URL — first one we saw. */
  sampleApplyUrl: string;
  /** States we observed listings in (sample). */
  states: Set<string>;
}

async function fetchPage(
  query: string,
  page: number,
): Promise<AdzunaResult[]> {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey) {
    throw new Error(
      "ADZUNA_APP_ID and ADZUNA_APP_KEY must be set in .env.local",
    );
  }
  const params = new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    results_per_page: "50",
    what: query,
    category: "logistics-warehouse-jobs",
    sort_by: "date",
    max_days_old: "30",
  });
  const url = `https://api.adzuna.com/v1/api/jobs/us/search/${page}?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Adzuna ${res.status}: ${res.statusText}`);
  }
  const json = (await res.json()) as AdzunaResponse;
  return json.results ?? [];
}

function isLikelyAggregator(name: string): boolean {
  return LEAD_GEN_NAME_PATTERNS.some((re) => re.test(name));
}

function extractStateFromArea(area: string[] | undefined): string | null {
  if (!area) return null;
  for (const e of area) {
    if (e.length === 2 && /^[A-Z]{2}$/.test(e) && e !== "US") return e;
  }
  return null;
}

function looksLikeCdlPosting(title: string): boolean {
  // Skip obviously non-CDL listings (warehouse, forklift, etc.).
  const t = title.toLowerCase();
  if (/\b(warehouse|forklift|yard\s+jockey|package\s+handler|non[-\s]?cdl|class\s*b)\b/.test(t)) {
    return false;
  }
  return /\b(cdl|truck driver|tractor|class\s*a)\b/.test(t);
}

async function loadKnownNames(): Promise<Set<string>> {
  // Carriers we already have direct data on OR have already staged
  // for review. We don't want to surface them again as "new".
  const { db } = await import("../src/db/client");
  const { sql } = await import("drizzle-orm");
  const rows = (await db.execute(sql`
    SELECT DISTINCT LOWER(name) AS name FROM carriers WHERE status = 'active'
    UNION
    SELECT DISTINCT LOWER(name) AS name FROM pending_carriers
  `)) as unknown as Array<{ name: string }>;
  return new Set(rows.map((r) => normalize(r.name)));
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(inc|llc|corp|corporation|company|co|ltd|usa)\b\.?/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const knownNames = await loadKnownNames();

  console.log(
    `Adzuna carrier harvest: ${BROAD_QUERIES.length} queries × ${args.pages} pages = up to ${BROAD_QUERIES.length * args.pages} API calls, min listings ${args.minListings}, ${knownNames.size} already-known names excluded\n`,
  );

  const tally = new Map<string, CarrierTally>();
  let totalSeen = 0;

  for (const query of BROAD_QUERIES) {
    for (let page = 1; page <= args.pages; page++) {
      let results: AdzunaResult[] = [];
      try {
        results = await fetchPage(query, page);
      } catch (err) {
        console.error(
          `  ✗ query="${query}" page=${page} failed: ${err instanceof Error ? err.message : err}`,
        );
        continue;
      }
      if (results.length === 0) break; // no more pages

      for (const r of results) {
        totalSeen++;
        const raw = r.company?.display_name?.trim();
        if (!raw) continue;
        if (!looksLikeCdlPosting(r.title)) continue;

        const key = normalize(raw);
        if (!key) continue;
        if (knownNames.has(key)) continue;

        let row = tally.get(key);
        if (!row) {
          row = {
            name: raw,
            count: 0,
            isLikelyAggregator: isLikelyAggregator(raw),
            sampleTitle: r.title,
            sampleApplyUrl: r.redirect_url,
            states: new Set<string>(),
          };
          tally.set(key, row);
        }
        row.count++;
        const st = extractStateFromArea(r.location?.area);
        if (st) row.states.add(st);
      }
    }
  }

  const all = Array.from(tally.values()).sort((a, b) => b.count - a.count);
  const surfaced = all.filter((c) => c.count >= args.minListings);

  if (args.json) {
    console.log(
      JSON.stringify(
        surfaced.map((c) => ({
          name: c.name,
          count: c.count,
          isLikelyAggregator: c.isLikelyAggregator,
          states: Array.from(c.states),
          sampleTitle: c.sampleTitle,
          sampleApplyUrl: c.sampleApplyUrl,
        })),
        null,
        2,
      ),
    );
    process.exit(0);
  }

  const realCarriers = surfaced.filter((c) => !c.isLikelyAggregator);
  const aggregators = surfaced.filter((c) => c.isLikelyAggregator);

  console.log(
    `Scanned ${totalSeen} listings → ${tally.size} distinct unknown company names`,
  );
  console.log(
    `  ${realCarriers.length} look like real carriers (≥${args.minListings} listings each)`,
  );
  console.log(
    `  ${aggregators.length} look like lead-gen / aggregator brands\n`,
  );

  if (realCarriers.length > 0) {
    console.log("CARRIER CANDIDATES (top unknown carriers in Adzuna):");
    for (const c of realCarriers.slice(0, 30)) {
      const states =
        c.states.size > 0
          ? ` · ${Array.from(c.states).slice(0, 4).join(",")}`
          : "";
      console.log(
        `  ${String(c.count).padStart(3)} listings · ${c.name}${states}`,
      );
      console.log(`        sample: ${c.sampleTitle.slice(0, 70)}`);
    }
  }

  if (aggregators.length > 0) {
    console.log(
      "\nLIKELY AGGREGATORS (named like recruiting brands — skip or check manually):",
    );
    for (const c of aggregators.slice(0, 10)) {
      console.log(`  ${String(c.count).padStart(3)} listings · ${c.name}`);
    }
  }

  console.log(
    "\nNext step: copy any real-carrier names you want into a JSON list and feed",
  );
  console.log("  npx tsx scripts/batch-discover.ts --list path/to/list.json --commit");
}

main().catch((err) => {
  console.error("[discover-adzuna-carriers] failed:", err);
  process.exit(1);
});
