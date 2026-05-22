import type { CarrierKind, CarrierTier, MatchLabel } from "./types";

export function matchLabel(kind: CarrierKind, tier: CarrierTier): MatchLabel {
  if (tier === "tier_1") return "Sponsored Match";
  if (kind === "partner") return "Referral Partner";
  if (kind === "prospect") return "Public Job Posting";
  return null;
}
