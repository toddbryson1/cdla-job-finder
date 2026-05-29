// Shared types for the external-jobs module.

export interface ExternalJobListing {
  /** Source aggregator name. "adzuna" for now. */
  source: string;
  /** Unique id within the source. */
  sourceId: string;
  title: string;
  companyName: string | null;
  city: string | null;
  state: string | null;
  lat: number | null;
  lng: number | null;
  /**
   * Best-effort equipment tag derived from title/description ("reefer",
   * "flatbed", "dry_van", "tanker", etc.) — never trustworthy enough to
   * hard-filter on, but useful for sorting and UI badges.
   */
  equipmentGuess: string | null;
  salaryMinAnnualUsd: number | null;
  salaryMaxAnnualUsd: number | null;
  /** Adzuna returns "1" when it's predicted; we coerce to bool. */
  salaryIsPredicted: boolean;
  descriptionExcerpt: string | null;
  /** Public URL to apply / view the original posting. */
  redirectUrl: string;
  postedAt: Date | null;
}

/**
 * Display-ready external match. The matches page renders these
 * alongside the internal Match[] but in a separate visual section.
 */
export interface ExternalMatch {
  externalJobId: string; // our DB id, used to track impressions
  title: string;
  companyName: string | null;
  city: string | null;
  state: string | null;
  distanceMilesFromDriverHome: number | null;
  payRangeMinWeekly: number | null;
  payRangeMaxWeekly: number | null;
  /** True when the salary was Adzuna's own prediction, not on the posting. */
  payIsEstimated: boolean;
  source: string;
  redirectUrl: string;
  postedAt: Date | null;
}

export interface DriverGeoProfile {
  id: string;
  homeLat: number;
  homeLng: number;
  desiredEquipment: string[];
  minWeeklyPay: number;
  /**
   * If true, we don't filter by distance — the driver said they'd
   * relocate, so they'd consider listings anywhere.
   */
  willingToRelocate: boolean;
}
