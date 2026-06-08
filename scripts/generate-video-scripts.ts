// Video-script generator CLI (docs/CDLAjobs_Video_Script_Template.docx §14).
//
// Renders the 6 short-form video templates against live DB values for a
// (region, equipment) target. Variables resolve from the same source as
// the landing pages; templates whose required variables are null are
// skipped (never rendered with placeholders — §13). v1 is generation +
// human review only; no video production, no publishing.
//
// Usage:
//   npx tsx scripts/generate-video-scripts.ts atlanta-reefer
//       # render all templates for one combo to stdout (dry-run)
//   npx tsx scripts/generate-video-scripts.ts atlanta-reefer --template pay-focused
//       # one template only
//   npx tsx scripts/generate-video-scripts.ts atlanta-reefer --write
//       # write to generated/video-scripts/<slug>__<template>.txt
//   npx tsx scripts/generate-video-scripts.ts --all --write
//       # every prerendered (region, equipment) combo with enough data

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseJobSlug } from "../src/lib/slugs";
import { listSeedSlugs } from "../src/lib/page-data";
import {
  generateScriptsForSlug,
  getTemplate,
  VIDEO_SCRIPT_TEMPLATES,
} from "../src/lib/video-scripts";
import {
  listVideoScripts,
  saveGeneratedScript,
  videoScriptConversions,
} from "../src/lib/video-scripts/store";

interface Args {
  slugs: string[];
  all: boolean;
  template: string | null;
  write: boolean;
  save: boolean;
  list: boolean;
  outDir: string;
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    slugs: [],
    all: false,
    template: null,
    write: false,
    save: false,
    list: false,
    outDir: "generated/video-scripts",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--all") out.all = true;
    else if (a === "--write") out.write = true;
    else if (a === "--save") out.save = true;
    else if (a === "--list") out.list = true;
    else if (a === "--template") out.template = argv[++i] ?? null;
    else if (a === "--out") out.outDir = argv[++i] ?? out.outDir;
    else if (a.startsWith("--")) {
      console.error(`Unknown flag: ${a}`);
      process.exit(1);
    } else out.slugs.push(a);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // --list: show what's tracked in the DB, with intake conversions, and exit.
  if (args.list) {
    const rows = await listVideoScripts();
    if (rows.length === 0) {
      console.log("No tracked video scripts yet. Generate with --save.");
    } else {
      const conversions = await videoScriptConversions();
      const intakesByKey = new Map(
        conversions.map((c) => [`${c.slug}__${c.templateKey}`, c.intakes]),
      );
      console.log(`${rows.length} tracked video scripts:\n`);
      for (const r of rows) {
        const intakes = intakesByKey.get(`${r.slug}__${r.templateKey}`) ?? 0;
        const produced = r.producedVideoUrl ? ` -> ${r.producedVideoUrl}` : "";
        console.log(
          `  [${r.status}] ${r.slug} / ${r.templateKey} — ${intakes} intakes${produced}`,
        );
      }
    }
    process.exit(0);
  }

  if (args.template && !getTemplate(args.template)) {
    console.error(`Unknown template: ${args.template}`);
    process.exit(1);
  }

  let slugs: string[];
  if (args.all) {
    slugs = await listSeedSlugs();
    console.log(`--all: ${slugs.length} combos with enough data\n`);
  } else if (args.slugs.length > 0) {
    slugs = args.slugs;
  } else {
    console.error(
      "Provide one or more <region-equipment> slugs, or --all. e.g. atlanta-reefer",
    );
    process.exit(1);
  }

  if (args.write) await mkdir(args.outDir, { recursive: true });

  let rendered = 0;
  let skipped = 0;
  let written = 0;
  let saved = 0;

  for (const slug of slugs) {
    const parsed = parseJobSlug(slug);
    if (!parsed) {
      console.error(`  SKIP ${slug}: not a valid region-equipment slug`);
      continue;
    }

    // results is one entry per template, in VIDEO_SCRIPT_TEMPLATES order.
    let results = await generateScriptsForSlug(parsed, slug);
    if (args.template) {
      const idx = VIDEO_SCRIPT_TEMPLATES.findIndex(
        (t) => t.key === args.template,
      );
      results = idx >= 0 ? [results[idx]] : [];
    }

    console.log(`\n=== ${slug} ===`);
    for (const r of results) {
      if (!r.ok) {
        skipped++;
        console.log(`  [skipped] ${r.reason}`);
        continue;
      }
      rendered++;
      const { script } = r;
      if (script.warnings.length) {
        for (const w of script.warnings) console.log(`  [warn] ${w}`);
      }
      if (args.write) {
        const file = path.join(
          args.outDir,
          `${slug}__${script.templateKey}.txt`,
        );
        const header =
          script.warnings.length > 0
            ? script.warnings.map((w) => `# REVIEW: ${w}`).join("\n") + "\n\n"
            : "";
        await writeFile(file, header + script.body, "utf-8");
        written++;
        console.log(`  wrote ${file}`);
      } else if (!args.save) {
        console.log("\n" + script.body);
      }
      if (args.save) {
        // Upsert into the tracking table (preserves production status).
        await saveGeneratedScript(script);
        saved++;
        console.log(`  saved ${slug} / ${script.templateKey}`);
      }
    }
  }

  const tail = [
    args.write ? `${written} files written to ${args.outDir}` : null,
    args.save ? `${saved} saved to tracking table` : null,
  ].filter(Boolean);
  console.log(
    `\nDone. ${rendered} rendered, ${skipped} skipped${
      tail.length ? `, ${tail.join(", ")}` : " (dry-run; pass --write and/or --save)"
    }.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("[generate-video-scripts] failed:", err);
  process.exit(1);
});
