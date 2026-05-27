// SEO copy generators for individual job pages.
//
// Drivers search Google for things like "Class A driver Local jobs
// Phoenix AZ" or "OTR CDL-A truck driver Atlanta" — not for the
// carrier's internal position title. Our titles, meta descriptions,
// JSON-LD descriptions, and visible body text should foreground those
// query patterns: <Class A | CDL-A> + <lane> + <Driver Jobs|Driver> +
// <city, state>. Carrier name and pay reinforce, they don't lead.
//
// All copy here is deterministic from (job, carrier, city, variantIndex)
// so the same posting cycle produces the same output every render and
// Google's crawler sees stable content per URL. Different cycles (or
// different variants) produce different copy on purpose — that's the
// repost mechanism Google for Jobs wants when a listing stays open
// longer than ~3 weeks.

import type { carrierJobs, carriers } from "@/db/schema";

type Job = typeof carrierJobs.$inferSelect;
type Carrier = typeof carriers.$inferSelect;

export interface SeoCopyInput {
  job: Job;
  carrier: Carrier;
  /**
   * City this URL is targeting. Most pages use the carrier_job's domicile
   * city, but reposts may target a nearby metro to spread our SEO reach.
   * Always city + state — we never advertise a job in a city outside the
   * carrier's hiring radius.
   */
  city: string;
  state: string;
  /** Variant index (0..) picks which phrasing template to use. */
  variantIndex?: number;
}

export interface SeoCopy {
  /** <title> + og:title — under ~65 chars when possible. */
  pageTitle: string;
  /** <h1> on the page. */
  h1: string;
  /** meta description + og:description — ~155–160 chars ideal. */
  metaDescription: string;
  /** Long-form JobPosting.description body (≥800 chars ideal for Google). */
  jsonLdDescription: string;
  /** Short "what the job is" intro paragraph for the visible page body. */
  visibleIntro: string;
  /** Stable lane noun ("OTR", "Local", "Regional", "Dedicated"). */
  laneNoun: string;
}

const VARIANT_COUNT = 3;

export function generateSeoCopy(input: SeoCopyInput): SeoCopy {
  const { job, carrier, city, state } = input;
  const variantIndex = (input.variantIndex ?? 0) % VARIANT_COUNT;
  const carrierName = displayCarrierName(carrier.name);
  const laneNoun = deriveLaneNoun(job);
  const equipmentNoun = deriveEquipmentNoun(job);
  const pay = formatPay(job);

  // Page <title>: lead with the searched-for phrase pattern.
  //   "Local CDL-A Driver Jobs in Phoenix, AZ - Swift Transportation"
  //   "OTR Dry Van Driver Jobs in Atlanta, GA - $1,400-$1,800/wk"
  // 60–70 chars is the sweet spot for Google SERP truncation.
  const titleHead = `${laneNoun} ${equipmentNoun} Driver Jobs in ${city}, ${state}`;
  const titleTail = pay.shortLabel ?? carrierName;
  const pageTitle = `${titleHead} - ${titleTail}`;

  // <h1>: drivers see this on the page itself. Keep human, not
  // keyword-stuffed. Position title from the carrier feed wins here.
  const h1 = job.positionTitle;

  // Meta description: 1 sentence, must include city+state+pay+carrier.
  const metaDescription = buildMetaDescription(
    {
      laneNoun,
      equipmentNoun,
      city,
      state,
      carrierName,
      pay,
      hiringRadiusMiles: job.hiringRadiusMiles,
      homeTimeDescription: job.displayHomeTimeDescription,
    },
    variantIndex,
  );

  // Long-form description used in JSON-LD JobPosting.description.
  // Google rewards substantive content here. We build it from the
  // structured fields we have so it's both factual and rich.
  const jsonLdDescription = buildLongDescription(
    { job, carrier, city, state, carrierName, laneNoun, equipmentNoun, pay },
    variantIndex,
  );

  const visibleIntro = buildVisibleIntro(
    { city, state, carrierName, laneNoun, equipmentNoun, pay },
    variantIndex,
  );

  return {
    pageTitle,
    h1,
    metaDescription,
    jsonLdDescription,
    visibleIntro,
    laneNoun,
  };
}

// ---------- helpers ----------

export function displayCarrierName(name: string): string {
  return name.replace(/\s*\(composite\)\s*/gi, "").trim();
}

/**
 * Derive the lane noun a driver would actually search for.
 * Priority: position title keywords (most authoritative — the carrier
 * literally named the job) → accepted home-time array → hiring radius
 * (null means OTR).
 */
export function deriveLaneNoun(job: Job): string {
  // Position title is what the carrier called this job — most authoritative.
  const title = job.positionTitle.toLowerCase();
  if (/\bdedicated\b/.test(title)) return "Dedicated";
  if (/\bdrayage\b|\bport\b/.test(title)) return "Drayage";
  if (/\blocal\b/.test(title)) return "Local";
  if (/\botr\b|over[- ]the[- ]road/.test(title)) return "OTR";
  if (/\bregional\b/.test(title)) return "Regional";

  // Explicit home-time array fallback.
  const ht = job.acceptedHomeTimeTypes;
  if (ht?.includes("daily")) return "Local";
  if (ht?.includes("otr")) return "OTR";
  if (ht?.includes("weekly")) return "Regional";
  if (ht?.includes("biweekly")) return "Regional";

  // Hiring radius fallback.
  if (job.hiringRadiusMiles == null) return "OTR";
  if (job.hiringRadiusMiles <= 75) return "Local";
  if (job.hiringRadiusMiles <= 500) return "Regional";
  return "OTR";
}

/**
 * Plain-English equipment label used in titles and copy.
 * "dry-van" → "Dry Van", "reefer" → "Reefer", "flatbed" → "Flatbed", etc.
 */
export function deriveEquipmentNoun(job: Job): string {
  const slug = job.equipment.toLowerCase().trim();
  const map: Record<string, string> = {
    "dry-van": "Dry Van",
    reefer: "Reefer",
    flatbed: "Flatbed",
    tanker: "Tanker",
    hazmat: "Hazmat",
    "auto-hauler": "Auto Hauler",
    doubles: "Doubles",
    triples: "Triples",
    oversized: "Heavy Haul",
    dump: "Dump",
    mixer: "Mixer",
    intermodal: "Intermodal",
    otr: "OTR",
    local: "Local",
    regional: "Regional",
  };
  return (
    map[slug] ??
    slug
      .split("-")
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ")
  );
}

interface PayShape {
  min: number | null;
  max: number | null;
  label: string;
  shortLabel: string | null;
}

function formatPay(job: Job): PayShape {
  const min = job.displayPayRangeMinWeeklyUsd;
  const max = job.displayPayRangeMaxWeeklyUsd ?? job.payRangeMaxWeeklyUsd;
  if (min != null && max != null) {
    return {
      min,
      max,
      label: `$${min.toLocaleString()}–$${max.toLocaleString()} / week`,
      shortLabel: `$${Math.round(min / 100) * 100}-${Math.round(max / 100) * 100}/wk`,
    };
  }
  if (max != null) {
    return {
      min: null,
      max,
      label: `Up to $${max.toLocaleString()} / week`,
      shortLabel: `Up to $${max.toLocaleString()}/wk`,
    };
  }
  return { min: null, max: null, label: "Pay not published", shortLabel: null };
}

function buildMetaDescription(
  ctx: {
    laneNoun: string;
    equipmentNoun: string;
    city: string;
    state: string;
    carrierName: string;
    pay: PayShape;
    hiringRadiusMiles: number | null;
    homeTimeDescription: string | null;
  },
  variantIndex: number,
): string {
  const payClause = ctx.pay.max != null ? ` ${ctx.pay.label}.` : "";
  const homeTimeClause = ctx.homeTimeDescription
    ? ` Home time: ${ctx.homeTimeDescription}.`
    : "";
  const variants = [
    `${ctx.laneNoun} ${ctx.equipmentNoun} CDL-A driving job in ${ctx.city}, ${ctx.state} with ${ctx.carrierName}.${payClause}${homeTimeClause} Match in 6 minutes on CDLA.jobs.`,
    `${ctx.carrierName} is hiring Class A CDL ${ctx.laneNoun.toLowerCase()} ${ctx.equipmentNoun.toLowerCase()} drivers out of ${ctx.city}, ${ctx.state}.${payClause}${homeTimeClause} Apply on CDLA.jobs in 6 minutes.`,
    `Class A CDL ${ctx.laneNoun} ${ctx.equipmentNoun} driver job — ${ctx.city}, ${ctx.state}.${payClause} ${ctx.carrierName} is hiring now.${homeTimeClause} See if you match on CDLA.jobs.`,
  ];
  return variants[variantIndex % variants.length];
}

function buildVisibleIntro(
  ctx: {
    city: string;
    state: string;
    carrierName: string;
    laneNoun: string;
    equipmentNoun: string;
    pay: PayShape;
  },
  variantIndex: number,
): string {
  const payClause =
    ctx.pay.max != null ? `${ctx.pay.label} ` : "Competitive weekly pay ";
  const variants = [
    `${ctx.carrierName} is hiring Class A CDL drivers for a ${ctx.laneNoun.toLowerCase()} ${ctx.equipmentNoun.toLowerCase()} run out of ${ctx.city}, ${ctx.state}. ${payClause}for drivers who meet the carrier's safety criteria below.`,
    `If you're a Class A driver in or near ${ctx.city}, ${ctx.state} looking for a ${ctx.laneNoun.toLowerCase()} ${ctx.equipmentNoun.toLowerCase()} seat, ${ctx.carrierName} has an opening. ${payClause}— see what the carrier requires before you apply.`,
    `${ctx.carrierName} has a ${ctx.laneNoun.toLowerCase()} ${ctx.equipmentNoun.toLowerCase()} opening for Class A CDL drivers domiciled near ${ctx.city}, ${ctx.state}. ${payClause}with the carrier's full safety bar listed below.`,
  ];
  return variants[variantIndex % variants.length];
}

function buildLongDescription(
  ctx: {
    job: Job;
    carrier: Carrier;
    city: string;
    state: string;
    carrierName: string;
    laneNoun: string;
    equipmentNoun: string;
    pay: PayShape;
  },
  variantIndex: number,
): string {
  const paragraphs: string[] = [];

  // Lead paragraph — the SEO-keyword-rich one Google indexes first.
  paragraphs.push(buildVisibleIntro(ctx, variantIndex));

  // Carrier's own description, if any. Always include verbatim before our
  // structured derivatives so we never undercut the carrier's voice.
  if (ctx.job.description) {
    paragraphs.push(ctx.job.description.trim());
  }

  // Lane / route details.
  if (ctx.job.displayLaneDescription) {
    paragraphs.push(`Lane: ${ctx.job.displayLaneDescription}`);
  }

  // Home time.
  if (ctx.job.displayHomeTimeDescription) {
    paragraphs.push(`Home time: ${ctx.job.displayHomeTimeDescription}`);
  }

  // Pay.
  if (ctx.pay.max != null) {
    paragraphs.push(`Pay: ${ctx.pay.label}.`);
  }

  // Sign-on bonus.
  if (
    ctx.job.displaySigningBonusUsd != null &&
    ctx.job.displaySigningBonusUsd > 0
  ) {
    paragraphs.push(
      `Sign-on bonus: $${ctx.job.displaySigningBonusUsd.toLocaleString()}, paid per the carrier's standard schedule.`,
    );
  }

  // Benefits.
  if (ctx.job.displayBenefitsSummary) {
    paragraphs.push(`Benefits: ${ctx.job.displayBenefitsSummary}`);
  }

  // Requirements (Stage 2 hard filters).
  const reqLines: string[] = [];
  if (ctx.job.minExperienceMonths > 0) {
    reqLines.push(
      `Minimum ${ctx.job.minExperienceMonths} months of verifiable Class A CDL driving experience.`,
    );
  } else {
    reqLines.push("Open to recent CDL-A graduates.");
  }
  if (ctx.job.requiredEndorsements.length > 0) {
    reqLines.push(
      `Required endorsements: ${ctx.job.requiredEndorsements.join(", ").toUpperCase()}.`,
    );
  }
  if (ctx.job.maxTickets3yr != null) {
    reqLines.push(
      `No more than ${ctx.job.maxTickets3yr} moving violations in the last 3 years.`,
    );
  }
  if (ctx.job.maxAccidents3yr != null) {
    reqLines.push(
      `No more than ${ctx.job.maxAccidents3yr} accidents in the last 3 years.`,
    );
  }
  reqLines.push(
    ctx.job.acceptsDui
      ? ctx.job.duiMaxRecencyMonths
        ? `DUI accepted if older than ${Math.round(ctx.job.duiMaxRecencyMonths / 12)} years.`
        : "DUI reviewed case by case."
      : "DUI not accepted.",
  );
  reqLines.push(
    ctx.job.acceptsFelony
      ? "Felony reviewed case by case."
      : "Felony not accepted.",
  );
  reqLines.push(
    ctx.job.acceptsTerminated
      ? "Prior termination reviewed case by case."
      : "Cannot have been terminated from your last driving job.",
  );
  paragraphs.push(`Requirements:\n- ${reqLines.join("\n- ")}`);

  // Closing — keep the CDLA.jobs CTA out of JSON-LD per Google's
  // "no promotional language" guidance. The visible page has its own
  // CTA section.

  // Hiring area.
  if (ctx.job.hiringRadiusMiles != null) {
    paragraphs.push(
      `${ctx.carrierName} is hiring within ${ctx.job.hiringRadiusMiles} miles of ${ctx.job.domicileCity}, ${ctx.job.domicileState}. ${ctx.city}, ${ctx.state} is inside that hiring zone.`,
    );
  } else {
    paragraphs.push(
      `${ctx.carrierName} is hiring OTR drivers from anywhere in the United States. ${ctx.city}, ${ctx.state} is one of many home locations ${ctx.carrierName} hires from.`,
    );
  }

  return paragraphs.join("\n\n");
}
