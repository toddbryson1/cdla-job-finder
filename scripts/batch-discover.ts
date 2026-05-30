// Batch carrier-discovery sweep. Takes a hand-curated list of
// {name, url} pairs, runs the JSON-LD + Adzuna pipeline against
// each at small concurrency, and prints a hit-rate report so we can
// see which carriers our crawler actually works for.
//
// Why hand-curated and not FMCSA: FMCSA's census has 1M+ carriers,
// most of them tiny LLCs with no web presence. Until the crawler
// proves itself on known-substantial carriers, mass discovery is
// premature.
//
// Usage:
//   # Dry-run sweep across the bundled seed list:
//   npx tsx scripts/batch-discover.ts
//
//   # Stage every winner (>0 jobs) to pending_carriers:
//   npx tsx scripts/batch-discover.ts --commit
//
//   # Limit concurrency (default 3):
//   npx tsx scripts/batch-discover.ts --concurrency 1
//
//   # Use a JSON file of {name, url} pairs instead of the seed list:
//   npx tsx scripts/batch-discover.ts --list path/to/carriers.json

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { readFileSync } from "node:fs";

// Hand-curated list. Targets US OTR + dedicated + regional truckload
// carriers across equipment types. URLs are homepages; the crawler's
// careers-page finder + deep-crawler walks from there.
const SEED_CARRIERS: Array<{ name: string; url: string; careers?: string }> = [
  // Mega OTR
  { name: "Heartland Express", url: "https://heartlandexpress.com" }, // known working
  { name: "Werner Enterprises", url: "https://werner.com" },
  { name: "Schneider National", url: "https://schneider.com" },
  { name: "US Xpress", url: "https://www.usxpress.com" },
  { name: "C.R. England", url: "https://crengland.com" },
  { name: "Knight Transportation", url: "https://www.knighttrans.com" },
  { name: "Swift Transportation", url: "https://www.swifttrans.com" },
  { name: "J.B. Hunt", url: "https://www.jbhunt.com" },
  { name: "Crete Carrier", url: "https://www.cretecarrier.com" },
  { name: "Marten Transport", url: "https://www.marten.com" },

  // Reefer / dedicated specialists
  { name: "Prime Inc.", url: "https://primeinc.com" },
  { name: "Stevens Transport", url: "https://www.stevenstransport.com" },
  { name: "FFE Transportation", url: "https://www.ffeinc.com" },

  // Flatbed / specialized
  { name: "TMC Transportation", url: "https://www.tmctrans.com" },
  { name: "Maverick Transportation", url: "https://www.maverickusa.com" },
  { name: "Melton Truck Lines", url: "https://www.meltontruck.com" },
  { name: "PGT Trucking", url: "https://www.pgttrucking.com" },

  // Regional / smaller national
  { name: "Roehl Transport", url: "https://www.roehl.jobs" },
  { name: "May Trucking", url: "https://www.maytrucking.com" },
  { name: "Western Express", url: "https://www.westernexp.com" },
  { name: "Pam Transport", url: "https://www.pamtransport.com" },
  { name: "Dart Transit", url: "https://www.dartadvantage.com" },
  { name: "TransAm Trucking", url: "https://www.transamtruck.com" },
  { name: "Big M Transportation", url: "https://www.bigmtransport.com" },
  { name: "Mesilla Valley Transportation", url: "https://www.m-v-t.com" },
];

interface Args {
  commit: boolean;
  concurrency: number;
  list?: string;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { commit: false, concurrency: 3 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--commit") out.commit = true;
    else if (a === "--concurrency") out.concurrency = Number(argv[++i]) || 3;
    else if (a === "--list") out.list = argv[++i];
  }
  return out;
}

interface SweepRow {
  name: string;
  url: string;
  hit: boolean;
  jobCount: number;
  attemptSummary: string;
  sampleTitle: string | null;
  error: string | null;
}

async function runOne(
  carrier: { name: string; url: string; careers?: string },
  { commit }: { commit: boolean },
  importer: typeof import("../src/lib/carrier-discovery/discover"),
  persistImporter:
    | typeof import("../src/lib/carrier-discovery/persist")
    | null,
): Promise<SweepRow> {
  try {
    const report = await importer.discoverCarrierJobs({
      name: carrier.name,
      homepageUrl: carrier.url,
      careersUrl: carrier.careers,
    });
    const hit = report.jobs.length > 0;
    const attemptSummary = report.attempts
      .map((a) => `${a.ok ? "✓" : "·"} ${a.source}`)
      .join("  ");

    if (hit && commit && persistImporter) {
      await persistImporter.commitDiscovery({
        name: carrier.name,
        homepageUrl: carrier.url,
        careersUrl: carrier.careers,
        report,
      });
    }

    return {
      name: carrier.name,
      url: carrier.url,
      hit,
      jobCount: report.jobs.length,
      attemptSummary,
      sampleTitle: report.jobs[0]?.title ?? null,
      error: null,
    };
  } catch (err) {
    return {
      name: carrier.name,
      url: carrier.url,
      hit: false,
      jobCount: 0,
      attemptSummary: "(crashed)",
      sampleTitle: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
  onComplete?: (item: T, result: R, index: number) => void,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  async function pump() {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      const r = await worker(items[i]);
      results[i] = r;
      onComplete?.(items[i], r, i);
    }
  }
  const workers = Array(Math.max(1, concurrency))
    .fill(0)
    .map(() => pump());
  await Promise.all(workers);
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let carriers = SEED_CARRIERS;
  if (args.list) {
    const raw = readFileSync(args.list, "utf-8");
    carriers = JSON.parse(raw);
  }

  const importer = await import("../src/lib/carrier-discovery/discover");
  const persistImporter = args.commit
    ? await import("../src/lib/carrier-discovery/persist")
    : null;

  console.log(
    `Batch discovery: ${carriers.length} carriers, concurrency ${args.concurrency}` +
      (args.commit ? ", --commit ON" : ", dry-run"),
  );
  console.log("");

  const startedAt = Date.now();
  const results = await runWithConcurrency(
    carriers,
    args.concurrency,
    (c) => runOne(c, { commit: args.commit }, importer, persistImporter),
    (carrier, result, i) => {
      // Stream results as they finish so a long run gives feedback.
      const marker = result.hit ? "✓" : result.error ? "!" : "·";
      const detail = result.hit
        ? `${result.jobCount} jobs — ${result.sampleTitle?.slice(0, 60) ?? ""}`
        : result.error
          ? `error: ${result.error.slice(0, 80)}`
          : "no jobs";
      console.log(
        `  [${i + 1}/${carriers.length}] ${marker} ${carrier.name.padEnd(34)} ${detail}`,
      );
    },
  );

  const elapsed = Math.round((Date.now() - startedAt) / 100) / 10;
  console.log("");
  console.log("─".repeat(80));

  const hits = results.filter((r) => r.hit);
  const totalJobs = hits.reduce((sum, r) => sum + r.jobCount, 0);
  const errors = results.filter((r) => r.error != null);

  console.log(`Sweep complete in ${elapsed}s`);
  console.log(
    `  ${hits.length} / ${results.length} carriers returned jobs (${Math.round((100 * hits.length) / results.length)}% hit rate)`,
  );
  console.log(`  ${totalJobs} total jobs across all winners`);
  if (errors.length > 0) {
    console.log(`  ${errors.length} carriers crashed (see error column)`);
  }

  if (hits.length > 0) {
    console.log("\nWinners:");
    for (const h of hits.sort((a, b) => b.jobCount - a.jobCount)) {
      console.log(`  ${String(h.jobCount).padStart(3)} jobs · ${h.name}`);
    }
  }

  if (args.commit) {
    console.log(`\n${hits.length} winners staged to pending_carriers. Visit /admin to approve.`);
  } else if (hits.length > 0) {
    console.log("\nRe-run with --commit to stage every winner to pending_carriers.");
  }
}

main().catch((err) => {
  console.error("[batch-discover] failed:", err);
  process.exit(1);
});
