// Build a carrier_jobs row from one (opening, optional detail tab)
// pair. Per spec §10's mapping table.
//
// Quality tiers (§6):
//   complete — opening resolved + detail tab supplied core fields
//   partial  — opening resolved + detail tab thin
//   minimal  — opening did not resolve, OR resolved tab was empty
//
// Geocoding: anchor city/state (from detail tab) OR city/state parsed
// from the Division string (fallback) → lat/lng via zip_codes. If no
// location can be determined, we still emit the job with a fallback
// lat/lng of the carrier's home base (sync orchestrator handles that).

import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import type { carrierJobs } from "@/db/schema";
import type { DetailTab, OpeningRow } from "./types";

type CarrierJobInsert = typeof carrierJobs.$inferInsert;

// Transport America's apply URL — TA Dedicated IntelliApp. Confirm
// in spec §11 / handoff addendum §A3.1.
const TA_APPLICATION_URL =
  "https://intelliapp.driverapponline.com/c/transportamerica";

// Default hiring radius when the detail tab doesn't provide one.
// Transport America Dedicated jobs are domicile-anchored, not OTR,
// so a finite default is correct (vs. NULL which would mean OTR per
// our OTR-invariant CHECK constraint).
const DEFAULT_HIRING_RADIUS_MILES = 75;

// Extract "City, ST" from a Division string.
// Examples it handles:
//   "3M - Aberdeen, SD Solo"           → Aberdeen, SD
//   "AAP/CQ - Blaine, MN Flex"          → Blaine, MN
//   "Honda - Charlotte, NC Team"        → Charlotte, NC
//   "Norfolk Southern Altoona/Max Meadows" → null (no comma+state pattern)
//
// Strategy: find "Word(s), ST" near the END of the string. The city
// portion cannot contain "/" or "-" — those are separators between
// account name and city. Walk backwards from each ", ST" match and
// stop at the last clean stretch.
export function parseCityStateFromDivision(
  division: string,
): { city: string; state: string } | null {
  // Find every ", ST" candidate
  const re = /,\s*([A-Z]{2})\b/g;
  let lastMatch: { city: string; state: string } | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(division)) !== null) {
    const state = m[1].toUpperCase();
    const before = division.slice(0, m.index);
    // City = trailing run of letters/spaces (no dash, slash, comma)
    // walking backwards from the comma.
    const cityMatch = before.match(/([A-Za-z .']+)$/);
    if (cityMatch) {
      const city = cityMatch[1].trim();
      // Reject city that's just whitespace or 1 character (typically
      // a leftover from "X - " where the parser stuck at the dash).
      if (city.length >= 2) {
        lastMatch = { city, state };
      }
    }
  }
  return lastMatch;
}

interface GeocodeResult {
  lat: number;
  lng: number;
  zip: string | null;
}

/**
 * Look up a (city, state) in zip_codes. Returns the centroid of the
 * first matching zip. We accept any zip for the city; the matcher's
 * geo math doesn't care which one.
 */
async function geocodeCityState(
  city: string,
  state: string,
): Promise<GeocodeResult | null> {
  const rows = (await db.execute(sql`
    SELECT zip, lat::float AS lat, lng::float AS lng
    FROM zip_codes
    WHERE LOWER(city) = LOWER(${city})
      AND state = ${state.toUpperCase()}
    LIMIT 1
  `)) as unknown as Array<{ zip: string; lat: number; lng: number }>;
  if (rows.length === 0) {
    // Fuzzy fallback: try ILIKE on city (handles minor punctuation/dash variants).
    const fuzzy = (await db.execute(sql`
      SELECT zip, lat::float AS lat, lng::float AS lng
      FROM zip_codes
      WHERE state = ${state.toUpperCase()}
        AND city ILIKE ${city + "%"}
      LIMIT 1
    `)) as unknown as Array<{ zip: string; lat: number; lng: number }>;
    if (fuzzy.length === 0) return null;
    return { lat: Number(fuzzy[0].lat), lng: Number(fuzzy[0].lng), zip: fuzzy[0].zip };
  }
  return { lat: Number(rows[0].lat), lng: Number(rows[0].lng), zip: rows[0].zip };
}

/**
 * Normalize a Division string for use as an external_source_id key.
 * Same normalization the fuzzy-match uses for matching, so the key is
 * stable across cosmetic edits.
 */
export function normalizeDivisionForKey(division: string): string {
  return division
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function divisionHash(division: string): string {
  return crypto
    .createHash("sha256")
    .update(normalizeDivisionForKey(division))
    .digest("hex")
    .slice(0, 12);
}

export interface BuildContext {
  carrierId: string;
  /** Pre-resolved per opening; null when unresolved. */
  detailTab: DetailTab | null;
  opening: OpeningRow;
}

export interface BuildResult {
  ok: true;
  row: CarrierJobInsert;
  externalSourceId: string;
  qualityTier: "complete" | "partial" | "minimal";
  reasons: string[];
}

export interface BuildSkip {
  ok: false;
  reason: string;
  externalSourceId: string;
}

/**
 * Build a carrier_jobs insert from one opening + (optional) detail tab.
 *
 * Returns either:
 *   { ok: true, row, externalSourceId, qualityTier } — caller upserts
 *   { ok: false, reason } — opening couldn't be turned into a job
 *     (no parseable location AND no detail-tab anchor)
 */
export async function buildCarrierJobRow(
  ctx: BuildContext,
): Promise<BuildResult | BuildSkip> {
  const { carrierId, detailTab, opening } = ctx;
  const externalSourceId = `ta:opening:${divisionHash(opening.division)}`;
  const reasons: string[] = [];

  // Determine location. Tab anchor wins; fall back to Division parse.
  let city: string | null = detailTab?.anchorCity ?? null;
  let state: string | null = detailTab?.anchorState ?? null;
  let radiusMiles: number | null = detailTab?.hiringRadiusMiles ?? null;
  if (!city || !state) {
    const fromDivision = parseCityStateFromDivision(opening.division);
    if (fromDivision) {
      city = fromDivision.city;
      state = fromDivision.state;
      reasons.push("location parsed from Division string (detail tab had none)");
    }
  }

  if (!city || !state) {
    return {
      ok: false,
      reason: `no parseable location: division="${opening.division}"`,
      externalSourceId,
    };
  }

  const geo = await geocodeCityState(city, state);
  if (!geo) {
    return {
      ok: false,
      reason: `geocode failed: ${city}, ${state}`,
      externalSourceId,
    };
  }

  // Quality tier
  let qualityTier: "complete" | "partial" | "minimal";
  if (!detailTab) {
    qualityTier = "minimal";
    reasons.push("opening unresolved (no detail tab match)");
  } else if (detailTab.isComplete) {
    qualityTier = "complete";
  } else if (
    detailTab.hiringRadiusMiles != null ||
    detailTab.homeTimeDescription ||
    detailTab.equipmentDescription ||
    detailTab.requiredEndorsements.length > 0
  ) {
    qualityTier = "partial";
    reasons.push("resolved detail tab had some but not all core fields");
  } else {
    qualityTier = "minimal";
    reasons.push("resolved detail tab was empty");
  }

  // Status: filled openings (grey-shaded) sync as archived per §4.
  const status = opening.isFilled ? ("archived" as const) : ("active" as const);

  // Equipment: derive what we can. The detail tab's equipmentDescription
  // is free text; we map to our enum where possible. NULL stays NULL.
  const equipment = deriveEquipmentSlug(detailTab?.equipmentDescription);

  // Home time array: parse the detail-tab home time description.
  // Falls back to ["weekly"] for partial/minimal if not specified —
  // that's the most common dedicated cadence and the OTR invariant
  // CHECK constraint requires a non-empty array when radius IS set
  // (which it always is for TA dedicated; we never go NULL radius).
  const acceptedHomeTimeTypes = deriveHomeTimeArray(detailTab?.homeTimeDescription);

  // Title — prefer the carrier's named position, fall back to a
  // generated one with role + city.
  const positionTitle =
    detailTab?.tabName?.trim() || `${opening.division.trim()}`;

  // Description: structured composite of what we have, like Swift sync does.
  const descLines: string[] = [];
  descLines.push(`Transport America Dedicated — ${opening.division}`);
  if (detailTab?.lanesDescription) descLines.push(`Lanes: ${detailTab.lanesDescription}`);
  if (detailTab?.payRangeRawText) descLines.push(`Pay: ${detailTab.payRangeRawText}`);
  if (detailTab?.notes?.length) descLines.push(...detailTab.notes);

  const row: CarrierJobInsert = {
    carrierId,
    status,
    positionTitle,
    description: descLines.join("\n\n"),
    domicileCity: city,
    domicileState: state,
    domicileZip: geo.zip,
    domicileLat: String(geo.lat),
    domicileLng: String(geo.lng),
    hiringRadiusMiles: radiusMiles ?? DEFAULT_HIRING_RADIUS_MILES,
    equipment: equipment ?? "dry-van", // sensible default for dedicated; spec §11 Q7
    minExperienceMonths: detailTab?.minExperienceMonths ?? 6, // Level 1 default per §9
    requiredEndorsements: detailTab?.requiredEndorsements ?? [],
    acceptedHomeTimeTypes,
    displayHomeTimeDescription: detailTab?.homeTimeDescription ?? null,
    displayLaneDescription: detailTab?.lanesDescription ?? null,
    applicationSurface: "tenstreet_intelliapp",
    applicationUrl: TA_APPLICATION_URL,
    dataSource: "transport_america" as const,
    externalSourceId,
    verificationStatus: "unverified",
    dataQuality: qualityTier === "complete" ? "complete" : qualityTier === "partial" ? "partial" : "minimal",
    lastVerifiedAt: new Date(),
  };

  return { ok: true, row, externalSourceId, qualityTier, reasons };
}

/**
 * Map a free-text equipment description to one of our equipment slugs.
 * Returns null if we can't make a confident call — the row builder
 * falls back to "dry-van" (the dominant dedicated category).
 */
export function deriveEquipmentSlug(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = text.toLowerCase();
  if (/\bflatbed\b/.test(t)) return "flatbed";
  if (/\breefer\b|\brefrigerated\b/.test(t)) return "reefer";
  if (/\btanker\b/.test(t)) return "tanker";
  if (/\bbox\s*truck\b|\bstraight\s*truck\b/.test(t)) return "dry-van"; // box → treat as dry-van for matching
  if (/\bstep\s*deck\b/.test(t)) return "flatbed";
  if (/\bauto\s*hauler\b|\bcar\s*hauler\b/.test(t)) return "auto-hauler";
  if (/\bintermodal\b|\bdrayage\b/.test(t)) return "intermodal";
  if (/\bdry\s*van\b|\b53'?\s*van\b|\btrailer\b/.test(t)) return "dry-van";
  return null;
}

export function deriveHomeTimeArray(
  text: string | null | undefined,
): ("daily" | "weekly" | "biweekly" | "otr")[] {
  if (!text) return ["weekly"];
  const t = text.toLowerCase();
  const out = new Set<"daily" | "weekly" | "biweekly" | "otr">();
  if (/\bdaily\b|\bhome\s*daily\b|\bhome\s*every\s*day\b|\bshuttle\b/.test(t)) {
    out.add("daily");
  }
  if (/\bweekly\b|\bhome\s*weekly\b|\b34[- ]hour\b|\bweekend\b/.test(t)) {
    out.add("weekly");
  }
  if (/\bbiweekly\b|\bevery\s*other\s*week\b|\b2\s*weeks?\b/.test(t)) {
    out.add("biweekly");
  }
  if (/\botr\b|\bover[- ]the[- ]road\b/.test(t)) out.add("otr");
  return out.size > 0 ? [...out] : ["weekly"];
}
