// Slug helpers for individual job posting URLs at /job/[slug].
//
// Slug format:
//   <carrier-name-slug>-<position-slug>-<city>-<state>-<id-prefix>
//
// Examples:
//   swift-transportation-otr-dry-van-driver-phoenix-az-a1b2c3d4
//   southeast-multi-equipment-cdl-a-flatbed-driver-jacksonville-fl-98765abc
//
// The 8-char id_prefix is the first 8 chars of the carrier_job UUID —
// uniquely resolves the row (1-in-4-billion collision rate on hex
// strings; fine for our scale). If we ever exceed that, migrate to a
// stored slug column on carrier_jobs with a uniqueness constraint.

import type { carrierJobs, carriers } from "@/db/schema";

const ID_SUFFIX_LENGTH = 8;

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining marks
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function buildJobPostingSlug(
  carrier: Pick<typeof carriers.$inferSelect, "name">,
  job: Pick<
    typeof carrierJobs.$inferSelect,
    "id" | "positionTitle" | "domicileCity" | "domicileState"
  >,
): string {
  const parts = [
    slugify(carrier.name.replace(/\(composite\)/i, "")),
    slugify(job.positionTitle),
    slugify(job.domicileCity),
    slugify(job.domicileState),
    job.id.replace(/-/g, "").slice(0, ID_SUFFIX_LENGTH),
  ].filter((s) => s.length > 0);
  return parts.join("-");
}

/**
 * Same as buildJobPostingSlug but takes flat fields. Use from
 * client components / Match-style objects where we don't have a full
 * carrier+job row available.
 */
export function buildJobPostingSlugFromFields(input: {
  carrierName: string;
  jobId: string;
  positionTitle: string;
  domicileCity: string;
  domicileState: string;
}): string {
  return buildJobPostingSlug(
    { name: input.carrierName },
    {
      id: input.jobId,
      positionTitle: input.positionTitle,
      domicileCity: input.domicileCity,
      domicileState: input.domicileState,
    },
  );
}

/**
 * Extract the id-prefix (last 8 chars) from a slug. The caller looks the
 * job up by `id ILIKE '${prefix-with-dashes}%'`.
 */
export function jobIdPrefixFromSlug(slug: string): string | null {
  const trimmed = slug.trim().toLowerCase();
  // The last segment, joined by trailing dashes, is the hex prefix.
  // Slug ends with `-<8hex>` so grab everything after the final dash.
  const lastDash = trimmed.lastIndexOf("-");
  if (lastDash < 0) return null;
  const candidate = trimmed.slice(lastDash + 1);
  if (!/^[0-9a-f]{8}$/.test(candidate)) return null;
  return candidate;
}

/**
 * Re-build the UUID-prefix LIKE pattern from an 8-char hex slug suffix.
 * "a1b2c3d4" → "a1b2c3d4-%".
 */
export function jobIdLikePattern(prefix: string): string {
  if (prefix.length < ID_SUFFIX_LENGTH) return `${prefix}%`;
  return `${prefix.slice(0, ID_SUFFIX_LENGTH)}-%`;
}
