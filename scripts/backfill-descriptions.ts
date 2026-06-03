// One-shot backfill: find carrier_jobs rows with thin or missing
// `description` text and generate ~3 sentences of carrier-specific
// prose from the structured fields (equipment, lane, home time, pay,
// signing bonus, benefits, accepted regions).
//
// Why this helps even after the displayDescription composer ships:
//   - The composer is render-time only — it builds an in-memory
//     fallback from the structured fields, but the carrier_jobs.
//     description column stays null. Anything reading the column
//     directly (the /matches MatchCard "About the job" section, the
//     /job/[slug] SEO body, the SitemapJobPosting JSON-LD) still
//     shows nothing.
//   - SEO crawlers don't run the composer. /job/[slug] pages need
//     real prose in the description column for Google for Jobs.
//   - Once backfilled, the row's description survives schema changes
//     and powers future renderers we haven't built yet.
//
// Default behavior is dry-run: prints what it WOULD generate, doesn't
// touch the DB. Pass --apply to write.
//
// Usage:
//   npx tsx scripts/backfill-descriptions.ts                       # dry-run
//   npx tsx scripts/backfill-descriptions.ts --apply               # actually write
//   npx tsx scripts/backfill-descriptions.ts --apply --limit 10    # cap the batch
//   npx tsx scripts/backfill-descriptions.ts --apply --regen-all   # ignore length check; rewrite every row
//
// Cost note: claude-haiku-4-5 at ~$0.005/job. ~150 jobs ≈ $0.75.

import Anthropic from "@anthropic-ai/sdk";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { carrierJobs, carriers } from "@/db/schema";

const MODEL = "claude-haiku-4-5";
const MIN_USEFUL_DESCRIPTION_CHARS = 80;
const PER_REQUEST_DELAY_MS = 250; // gentle on Anthropic
const PROSE_MAX_CHARS = 1200; // hard cap on generated output

interface Args {
  apply: boolean;
  regenAll: boolean;
  limit: number | null;
  carrierId: string | null;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let apply = false;
  let regenAll = false;
  let limit: number | null = null;
  let carrierId: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--apply") apply = true;
    else if (a === "--regen-all") regenAll = true;
    else if (a === "--limit") {
      limit = Number(argv[++i]);
      if (!Number.isFinite(limit) || limit <= 0) {
        console.error("--limit needs a positive integer");
        process.exit(2);
      }
    } else if (a === "--carrier") {
      carrierId = argv[++i] ?? null;
    } else {
      console.error(`Unknown arg: ${a}`);
      process.exit(2);
    }
  }
  return { apply, regenAll, limit, carrierId };
}

interface JobRow {
  id: string;
  carrierName: string;
  positionTitle: string;
  description: string | null;
  equipment: string;
  domicileCity: string;
  domicileState: string;
  hiringRadiusMiles: number | null;
  acceptedHomeTimeTypes: string[];
  minExperienceMonths: number;
  requiredEndorsements: string[];
  acceptedCdlStates: string[];
  acceptsTerminated: boolean;
  acceptsFailedDotTest: boolean;
  sapTolerance: string;
  payRangeMaxWeeklyUsd: number | null;
  displayPayRangeMinWeeklyUsd: number | null;
  displayPayRangeMaxWeeklyUsd: number | null;
  displaySigningBonusUsd: number | null;
  displayHomeTimeDescription: string | null;
  displayLaneDescription: string | null;
  displayBenefitsSummary: string | null;
}

function buildPrompt(j: JobRow): string {
  const lines: string[] = [];
  lines.push(`Carrier: ${j.carrierName}`);
  lines.push(`Position: ${j.positionTitle}`);
  lines.push(`Equipment: ${j.equipment}`);
  lines.push(`Domicile: ${j.domicileCity}, ${j.domicileState}`);
  if (j.hiringRadiusMiles != null) {
    lines.push(`Hiring radius: ${j.hiringRadiusMiles} miles`);
  } else if (j.acceptedHomeTimeTypes.includes("otr")) {
    lines.push(`Hiring radius: OTR (nationwide)`);
  }
  if (j.acceptedHomeTimeTypes.length > 0) {
    lines.push(`Home time types: ${j.acceptedHomeTimeTypes.join(", ")}`);
  }
  if (j.displayHomeTimeDescription) {
    lines.push(`Home time detail: ${j.displayHomeTimeDescription}`);
  }
  if (j.displayLaneDescription) {
    lines.push(`Lane: ${j.displayLaneDescription}`);
  }
  if (j.minExperienceMonths > 0) {
    lines.push(`Minimum experience: ${j.minExperienceMonths} months CDL-A`);
  }
  if (j.requiredEndorsements.length > 0) {
    lines.push(
      `Required endorsements: ${j.requiredEndorsements.join(", ").toUpperCase()}`,
    );
  }
  if (j.acceptedCdlStates.length > 0 && j.acceptedCdlStates.length <= 20) {
    lines.push(`Accepted CDL states: ${j.acceptedCdlStates.join(", ")}`);
  }
  const payMin = j.displayPayRangeMinWeeklyUsd ?? null;
  const payMax = j.displayPayRangeMaxWeeklyUsd ?? j.payRangeMaxWeeklyUsd ?? null;
  if (payMin != null && payMax != null) {
    lines.push(`Pay: $${payMin}–$${payMax}/week`);
  } else if (payMax != null) {
    lines.push(`Pay: up to $${payMax}/week`);
  }
  if (j.displaySigningBonusUsd && j.displaySigningBonusUsd > 0) {
    lines.push(`Signing bonus: $${j.displaySigningBonusUsd}`);
  }
  if (j.displayBenefitsSummary) {
    lines.push(`Benefits: ${j.displayBenefitsSummary}`);
  }
  lines.push("Accepts terminated drivers: " + (j.acceptsTerminated ? "yes" : "no"));
  lines.push("Accepts failed DOT test history: " + (j.acceptsFailedDotTest ? "yes" : "no"));
  if (j.sapTolerance && j.sapTolerance !== "accepts_none") {
    lines.push(`SAP tolerance: ${j.sapTolerance}`);
  }
  return lines.join("\n");
}

const SYSTEM_PROMPT = `You write short, honest job descriptions for CDL-A driver listings on CDLA.jobs. Three sentences, plain English, present tense.

Rules:
- Use ONLY the facts in the input. Don't invent benefits, bonuses, mileage, or anything the carrier didn't say.
- Lead with what the job actually is (lane / home time / equipment). Then mention the floor (experience + endorsements). End with pay or bonus when present.
- Voice: warm, driver-first, like a recruiter you'd actually trust. No "guaranteed," no "exclusive," no "act now," no exclamation points.
- Don't repeat the position title verbatim.
- Don't say "We're hiring" — describe the carrier and the role from the driver's POV.
- 60-180 words.

Output ONLY the description prose. No headings, no bullets, no preamble.`;

async function generateDescription(
  client: Anthropic,
  j: JobRow,
): Promise<string> {
  const res = await client.messages.create(
    {
      model: MODEL,
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildPrompt(j) }],
    },
    { timeout: 30_000 },
  );
  const block = res.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new Error("Claude returned no text block");
  }
  const text = block.text.trim();
  if (text.length < 40) {
    throw new Error(`Generated description too short: ${text.length} chars`);
  }
  return text.slice(0, PROSE_MAX_CHARS);
}

async function main() {
  const args = parseArgs();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY not set");
    process.exit(2);
  }

  console.log(
    `\nDescription backfill — ${args.apply ? "APPLY mode (writes DB)" : "dry-run (no writes)"}` +
      (args.regenAll ? " · --regen-all" : "") +
      (args.limit ? ` · --limit ${args.limit}` : "") +
      (args.carrierId ? ` · --carrier ${args.carrierId}` : "") +
      "\n",
  );

  const candidateRows = await db
    .select({
      id: carrierJobs.id,
      carrierName: carriers.name,
      positionTitle: carrierJobs.positionTitle,
      description: carrierJobs.description,
      equipment: carrierJobs.equipment,
      domicileCity: carrierJobs.domicileCity,
      domicileState: carrierJobs.domicileState,
      hiringRadiusMiles: carrierJobs.hiringRadiusMiles,
      acceptedHomeTimeTypes: carrierJobs.acceptedHomeTimeTypes,
      minExperienceMonths: carrierJobs.minExperienceMonths,
      requiredEndorsements: carrierJobs.requiredEndorsements,
      acceptedCdlStates: carrierJobs.acceptedCdlStates,
      acceptsTerminated: carrierJobs.acceptsTerminated,
      acceptsFailedDotTest: carrierJobs.acceptsFailedDotTest,
      sapTolerance: carrierJobs.sapTolerance,
      payRangeMaxWeeklyUsd: carrierJobs.payRangeMaxWeeklyUsd,
      displayPayRangeMinWeeklyUsd: carrierJobs.displayPayRangeMinWeeklyUsd,
      displayPayRangeMaxWeeklyUsd: carrierJobs.displayPayRangeMaxWeeklyUsd,
      displaySigningBonusUsd: carrierJobs.displaySigningBonusUsd,
      displayHomeTimeDescription: carrierJobs.displayHomeTimeDescription,
      displayLaneDescription: carrierJobs.displayLaneDescription,
      displayBenefitsSummary: carrierJobs.displayBenefitsSummary,
    })
    .from(carrierJobs)
    .innerJoin(carriers, eq(carriers.id, carrierJobs.carrierId))
    .where(
      args.carrierId
        ? eq(carrierJobs.carrierId, args.carrierId)
        : sql`${carrierJobs.status} = 'active'`,
    );

  const filtered: JobRow[] = candidateRows.filter((r) => {
    if (args.regenAll) return true;
    const d = (r.description ?? "").trim();
    return d.length < MIN_USEFUL_DESCRIPTION_CHARS;
  }) as JobRow[];

  const batch = args.limit ? filtered.slice(0, args.limit) : filtered;

  console.log(
    `Scanned ${candidateRows.length} active rows · ${filtered.length} need a description · processing ${batch.length} this run\n`,
  );

  if (batch.length === 0) {
    console.log("Nothing to do. ✓");
    return;
  }

  const client = new Anthropic({ apiKey });
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < batch.length; i++) {
    const j = batch[i]!;
    const label = `[${i + 1}/${batch.length}] ${j.carrierName} · ${j.positionTitle} · ${j.domicileCity}, ${j.domicileState}`;
    try {
      const prose = await generateDescription(client, j);
      console.log(label);
      console.log(`  → ${prose.slice(0, 180)}${prose.length > 180 ? "…" : ""}\n`);

      if (args.apply) {
        await db
          .update(carrierJobs)
          .set({ description: prose, updatedAt: new Date() })
          .where(eq(carrierJobs.id, j.id));
      }
      succeeded++;
    } catch (err) {
      console.error(`${label}\n  ✗ ${err instanceof Error ? err.message : String(err)}\n`);
      failed++;
    }
    await new Promise((r) => setTimeout(r, PER_REQUEST_DELAY_MS));
  }

  console.log(
    `\n${args.apply ? "Wrote" : "Would write"} ${succeeded} descriptions${failed > 0 ? ` · ${failed} failed` : ""}.`,
  );
  if (!args.apply) {
    console.log("Re-run with --apply to commit the writes.");
  }
}

main().catch((err) => {
  console.error("Backfill crashed:", err);
  process.exit(1);
});
