// Polish the openings sheet's Division strings into a driver-friendly
// position title.
//
// DLM's Division field uses internal abbreviations that mean nothing
// to a CDL-A driver browsing on Google:
//   "AAP/CQ - Blaine, MN Flex"      → drivers don't know AAP/CQ
//   "CAT Shuttle - Lafayette, IN"   → fine (CAT = Caterpillar; widely known)
//   "NFS Altoona, PA"               → drivers don't know NFS
//
// This module maps known account-name abbreviations to their public
// names, normalizes the dash-separator style, and leaves unknowns
// untouched. The original Division string is preserved in the
// carrier_jobs.description body — this only affects what we put in
// position_title (and therefore the page H1, JSON-LD title, sitemap
// derived display, etc.).

interface AccountMap {
  /** Pattern matching the abbreviation at the start of the Division. */
  match: RegExp;
  /** Replacement — what drivers should see. */
  display: string;
}

// Ordered: longer / more-specific patterns first.
const ACCOUNT_MAPPINGS: AccountMap[] = [
  // AAP/CQ and variants → Advance Auto Parts / Carquest
  // (Same account; DLM uses different abbreviations on different tabs.)
  { match: /^AAP\s*\/\s*CQ\b/i, display: "Advance Auto Parts / Carquest" },
  { match: /^AA\s*\/\s*CQ\b/i, display: "Advance Auto Parts / Carquest" },
  { match: /^AA\s*\/\s*Carquest\b/i, display: "Advance Auto Parts / Carquest" },
  { match: /^AAP\b/i, display: "Advance Auto Parts" },
  { match: /^AA\b/i, display: "Advance Auto Parts" },

  // Norfolk Southern (railroad shuttle accounts)
  { match: /^NFS\b/i, display: "Norfolk Southern" },
  { match: /^NS\b(?![A-Za-z])/i, display: "Norfolk Southern" },

  // Caterpillar shuttle accounts — drivers do recognize CAT, but
  // expand it for SEO + clarity.
  { match: /^CAT\b(?![A-Za-z])/i, display: "Caterpillar" },

  // BPI / Bunge — leave BPI as is; it's the operating name DLM uses
  // for this account and drivers see it.
  // (No mapping; falls through to identity.)

  // VWR Scientific
  { match: /^VWR\b/i, display: "VWR Scientific" },
];

/**
 * Polish one Division string into a driver-friendly position title.
 *
 * Transformations:
 *   1. Expand known account abbreviations (AAP/CQ → Advance Auto Parts / Carquest)
 *   2. Normalize "Acme - City, ST Role" → "Acme — City, ST Role"
 *      (em-dash for visual breathing room; keeps the comma+state)
 *   3. Trim trailing parentheticals — those are recruiter shift notes
 *      that aren't useful for a public title.
 *
 * Idempotent: re-polishing an already-polished string yields the
 * same string (within reason — em-dash to em-dash).
 *
 * The original Division text is preserved by the caller in the
 * carrier_jobs.description body, so nothing is lost.
 */
export function polishDivisionForTitle(division: string): string {
  let out = division.trim();

  // 1. Account abbreviation expansion
  for (const { match, display } of ACCOUNT_MAPPINGS) {
    if (match.test(out)) {
      out = out.replace(match, display);
      break; // first match wins (account abbrev appears once at start)
    }
  }

  // 2. Drop trailing parentheticals like "(1 for Sun, M, W, F)"
  // (recruiter notes). Keep parentheticals INSIDE the title — only
  // strip if they're at the end.
  out = out.replace(/\s*\([^)]*\)\s*$/g, "").trim();

  // 3. Dash style — turn the first " - " separator into " — " (em-dash)
  // for slightly cleaner visual separation between account and city.
  out = out.replace(/\s-\s/, " — ");

  return out;
}
