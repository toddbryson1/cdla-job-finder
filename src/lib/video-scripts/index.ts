// Video-script generator (docs/CDLAjobs_Video_Script_Template.docx §13–14).
//
// Resolves the template variables for a (region, equipment) target from
// the SAME data source as the landing pages (resolvePageData), then
// renders the 6 templates. Per §13: if a required variable is null, the
// template is skipped (never rendered with placeholders or fake numbers);
// pay outliers are flagged for human review.
//
// v1 is generation-only — render to reviewable text. Production and a
// generated-scripts tracking table are explicitly out of scope (§14).

import { resolvePageData } from "@/lib/page-data";
import { REGIONS, EQUIPMENT, type ParsedSlug } from "@/lib/slugs";
import {
  VIDEO_SCRIPT_TEMPLATES,
  type VideoScriptTemplate,
} from "./templates";

export { VIDEO_SCRIPT_TEMPLATES, getTemplate } from "./templates";
export type { VideoScriptTemplate, ScriptPart } from "./templates";

/** Sanity bounds for pay numbers (§13). Outside these → flag for review. */
const PAY_FLOOR = 500;
const PAY_CEILING = 5000;

export type ScriptVarValue = string | null;

export interface ResolvedVariables {
  /** Lowercase-keyed variable map; null means "no data". */
  vars: Record<string, ScriptVarValue>;
  /** Non-fatal issues a human should look at before producing. */
  warnings: string[];
}

function formatUsd(n: number): string {
  return `$${n.toLocaleString("en-US")}`;
}

/** weekly/daily/biweekly humanize for the home-time template. OTR (or
 *  unknown) returns null so the "tired of being out 3 weeks" script is
 *  skipped rather than promising home time it can't deliver. */
function humanizeHomeTime(ht: string | null): string | null {
  switch (ht) {
    case "daily":
      return "daily";
    case "weekly":
      return "weekly";
    case "biweekly":
      return "every other week";
    default:
      return null; // otr / null
  }
}

/** "Atlanta, GA" -> "Atlanta"; "Texas" -> "Texas"; "the Southeast" -> same. */
function regionShort(displayName: string): string {
  return displayName.replace(/,\s*[A-Z]{2}$/, "");
}

/**
 * Resolve all template variables for a target combo from the live DB
 * (same queries the landing page uses). Returns lowercase-keyed values
 * plus any human-review warnings (e.g. pay outliers).
 */
export async function resolveScriptVariables(
  parsed: ParsedSlug,
  slug: string,
): Promise<ResolvedVariables> {
  const data = await resolvePageData(parsed);
  const warnings: string[] = [];

  const region = parsed.regionInfo.displayName;
  // equipment_humanized in the docs is "reefer driver" (no article); the
  // shared EQUIPMENT.humanized is "a reefer driver" — strip the article.
  const equipmentHumanized = parsed.equipmentInfo.humanized.replace(
    /^an? /,
    "",
  );
  const equipment = parsed.equipmentInfo.displayName.toLowerCase();

  // Pay sanity (§13). Flag rather than drop — a human decides.
  if (data.payLow != null && data.payLow < PAY_FLOOR) {
    warnings.push(
      `pay_low ${formatUsd(data.payLow)} is below $${PAY_FLOOR} — verify before producing.`,
    );
  }
  if (data.payHigh != null && data.payHigh > PAY_CEILING) {
    warnings.push(
      `pay_high ${formatUsd(data.payHigh)} is above $${PAY_CEILING} — verify before producing.`,
    );
  }

  const landingPageUrl = `cdla.jobs/jobs/${slug}`;

  const vars: Record<string, ScriptVarValue> = {
    equipment,
    equipment_humanized: equipmentHumanized,
    region,
    region_short: regionShort(region),
    pay_low: data.payLow != null ? formatUsd(data.payLow) : null,
    pay_high: data.payHigh != null ? formatUsd(data.payHigh) : null,
    pay_median: data.payMedian != null ? formatUsd(data.payMedian) : null,
    carrier_count:
      data.totalCarrierCount > 0 ? String(data.totalCarrierCount) : null,
    home_time: humanizeHomeTime(data.mostCommonHomeTime),
    landing_page_url: landingPageUrl,
    // No URL shortener yet — use the full landing URL. A vanity short
    // domain (docs example cdla.jo/atl-reefer) is a future enhancement.
    short_url: landingPageUrl,
  };

  return { vars, warnings };
}

const TOKEN_RE = /\[\[([a-zA-Z_]+)\]\]/g;

/** Capitalize the first character (for [[Region]] vs [[region]] casing). */
function capFirst(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

/**
 * Substitute [[token]]s in a line. Token casing controls output casing:
 * an uppercase first letter capitalizes the resolved value. Returns the
 * filled line plus any variable keys that resolved to null.
 */
export function fillLine(
  line: string,
  vars: Record<string, ScriptVarValue>,
): { text: string; missing: string[] } {
  const missing: string[] = [];
  const text = line.replace(TOKEN_RE, (_m, rawKey: string) => {
    const key = rawKey.toLowerCase();
    const value = vars[key];
    if (value == null) {
      missing.push(key);
      return `[[${rawKey}]]`;
    }
    const startsUpper = rawKey[0] === rawKey[0].toUpperCase();
    return startsUpper ? capFirst(value) : value;
  });
  return { text, missing };
}

export interface RenderedScript {
  templateKey: string;
  templateName: string;
  slug: string;
  region: string;
  equipment: string;
  body: string;
  warnings: string[];
}

export type RenderResult =
  | { ok: true; script: RenderedScript }
  | { ok: false; skipped: true; reason: string; missing: string[] };

/**
 * Render one template against resolved variables. Skips (per §13) if any
 * required variable is null — no placeholder/fake-number output ever.
 */
export function renderTemplate(
  template: VideoScriptTemplate,
  resolved: ResolvedVariables,
  meta: { slug: string; region: string; equipment: string },
): RenderResult {
  const { vars, warnings } = resolved;

  const missingRequired = template.requiredVars.filter(
    (k) => vars[k] == null,
  );
  if (missingRequired.length > 0) {
    return {
      ok: false,
      skipped: true,
      reason: `missing required variable(s): ${missingRequired.join(", ")}`,
      missing: missingRequired,
    };
  }

  const lines: string[] = [
    `TEMPLATE: ${template.name} (${template.key})`,
    `TARGET:   ${meta.region} — ${meta.equipment}  [${meta.slug}]`,
    "",
  ];
  for (const part of template.parts) {
    const vo = fillLine(part.voiceover, vars);
    const os = fillLine(part.onScreen, vars);
    lines.push(`${part.part} (${part.timecode})`);
    lines.push(`  VOICEOVER: ${vo.text}`);
    lines.push(`  ON SCREEN: ${os.text}`);
    lines.push("");
  }

  return {
    ok: true,
    script: {
      templateKey: template.key,
      templateName: template.name,
      slug: meta.slug,
      region: meta.region,
      equipment: meta.equipment,
      body: lines.join("\n").trimEnd() + "\n",
      warnings,
    },
  };
}

/**
 * Resolve + render all templates for a single (region, equipment) target.
 * Returns one RenderResult per template (some may be skipped).
 */
export async function generateScriptsForSlug(
  parsed: ParsedSlug,
  slug: string,
): Promise<RenderResult[]> {
  const resolved = await resolveScriptVariables(parsed, slug);
  const meta = {
    slug,
    region: parsed.regionInfo.displayName,
    equipment: parsed.equipmentInfo.displayName,
  };
  return VIDEO_SCRIPT_TEMPLATES.map((t) =>
    renderTemplate(t, resolved, meta),
  );
}

/** Re-exported maps for callers that enumerate combos. */
export { REGIONS, EQUIPMENT };
