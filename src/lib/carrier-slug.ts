// Slug helpers for /carriers/[slug] carrier profile pages.
//
// One URL per carrier listing all their active jobs. Slug is the
// kebab-cased carrier name minus our internal "(composite)" tag.
// Examples:
//   "C.R. England"                  → "c-r-england"
//   "Swift Transportation"           → "swift-transportation"
//   "Transport America"              → "transport-america"
//   "Atlanta Reefer Co (composite)" → "atlanta-reefer-co"

import type { carriers } from "@/db/schema";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\(composite\)/gi, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function buildCarrierSlug(
  carrier: Pick<typeof carriers.$inferSelect, "name">,
): string {
  return slugify(carrier.name);
}

// displayCarrierName lives in @/lib/job-seo-copy — single source of truth.
