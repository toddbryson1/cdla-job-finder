export type CarrierKind = "partner" | "prospect" | "subscription";
export type CarrierTier = "tier_1" | "tier_2" | "none";
export type ApplicationSurface =
  | "tenstreet_intelliapp"
  | "custom_intake_form"
  | "email_only"
  | "phone_only"
  | "unknown";
export type VerificationStatus = "verified" | "stale" | "unverified";
export type DataQuality = "complete" | "partial" | "minimal";
export type MatchLabel =
  | "Sponsored Match"
  | "Referral Partner"
  | "Public Job Posting"
  | null;

export interface Match {
  jobId: string;
  carrierId: string;
  carrierName: string;
  carrierKind: CarrierKind;
  carrierTier: CarrierTier;
  label: MatchLabel;
  positionTitle: string;
  equipment: string;
  domicileCity: string;
  domicileState: string;
  distanceMilesFromDriverHome: number | null;
  payRangeMinWeekly: number | null;
  payRangeMaxWeekly: number | null;
  payWarning: "pay_not_disclosed" | null;
  applicationSurface: ApplicationSurface;
  applicationUrl: string | null;
  applicationPhone: string | null;
  softRankScore: number;
  exclusivityWindowEndsAt: Date | null;
  verificationStatus: VerificationStatus;
  dataQuality: DataQuality;
}

export interface MatchResult {
  driverId: string;
  matchedAt: Date;
  matches: Match[];
  truncated: boolean;
}

export type GetFirstMatchTime = (
  driverId: string,
  carrierId: string,
) => Promise<Date | null>;

export interface MatchOptions {
  now?: Date;
  getFirstMatchTime?: GetFirstMatchTime;
  limit?: number;
}

export interface Stage2Data {
  tickets3yrCount: number;
  accidents3yrCount: number;
  accidents3yrAtFaultCount: number;
  duiEver: boolean;
  duiMostRecentDate: Date | null;
  felonyEver: boolean;
}

export interface QualificationResult {
  qualifies: boolean;
  reasons: string[];
}
