// Shared types for carrier-discovery. A "discovered job" is the
// normalized output of *any* source — JSON-LD on a carrier site,
// Adzuna's company-filtered search, future Tenstreet/ATS connectors.
// The downstream ingest pipeline maps this into carrier_jobs.

export type DiscoverySource =
  | "json_ld" // <script type="application/ld+json"> on carrier careers page
  | "adzuna_company"; // Adzuna search filtered by company name

export interface DiscoveredJob {
  /** Where this row came from. */
  source: DiscoverySource;
  /**
   * Source-specific stable id. For JSON-LD, schema.org's
   * `identifier.value` if present, else a hash of (title+location).
   * For Adzuna, the listing id.
   */
  sourceId: string;
  title: string;
  /** Carrier name as the source named them (may differ from our row). */
  carrierName: string | null;
  city: string | null;
  state: string | null; // 2-letter abbrev
  lat: number | null;
  lng: number | null;
  /** Equipment guessed from title/description; null if unknown. */
  equipmentGuess: string | null;
  /** Pay normalized to weekly USD. Source rarely gives weekly directly. */
  payMinWeeklyUsd: number | null;
  payMaxWeeklyUsd: number | null;
  /** "WEEK", "HOUR", "YEAR", "MONTH" — what the source said. */
  payOriginalPeriod: string | null;
  description: string | null;
  /** URL the driver clicks through to apply. */
  applyUrl: string;
  /** When the source said it was posted; null if unknown. */
  postedAt: Date | null;
  /** Original payload for debugging — kept tiny. */
  rawSummary: string;
}

export interface DiscoveryReport {
  /** What we tried + which one returned data. */
  attempts: Array<{
    source: DiscoverySource | "careers_page_lookup";
    ok: boolean;
    note: string;
  }>;
  jobs: DiscoveredJob[];
}
