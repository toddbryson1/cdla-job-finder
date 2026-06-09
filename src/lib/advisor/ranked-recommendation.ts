// Ranked recommendation (advisor mode).
//
// "You rank, you don't dump" — a clear #1 with reasoning, then 2-4 ranked
// backups, each with the tradeoff behind it. Never an unranked wall of
// jobs (SPEC_debbie-advisor-mode-v2.md).
//
// matchDriver already returns matches in ranked order with per-match
// fitReasons. This module just partitions them into the advisor's
// presentation shape and supplies a human reason line, falling back to a
// neutral one when the engine produced no specific reasons (neutral mode).

import type { Match } from "@/lib/matching/types";

export interface RankedRecommendation {
  top: Match | null;
  backups: Match[];
  /** Total internal matches considered (before the backup cap). */
  totalConsidered: number;
}

const DEFAULT_MAX_BACKUPS = 4;

export function buildRankedRecommendation(
  matches: Match[],
  opts: { maxBackups?: number } = {},
): RankedRecommendation {
  const maxBackups = opts.maxBackups ?? DEFAULT_MAX_BACKUPS;
  if (matches.length === 0) {
    return { top: null, backups: [], totalConsidered: 0 };
  }
  return {
    top: matches[0],
    backups: matches.slice(1, 1 + maxBackups),
    totalConsidered: matches.length,
  };
}

/**
 * A short, honest "why this one" line for a match. Uses the engine's
 * fitReasons when present; otherwise a neutral fallback based on what we
 * can see. Never predicts a hire, never guarantees pay.
 */
export function reasonLine(match: Match): string {
  if (match.fitReasons.length > 0) {
    // Sentence-case join: "Pays above your floor · home time that fits".
    return match.fitReasons
      .map((r, i) => (i === 0 ? r.charAt(0).toUpperCase() + r.slice(1) : r))
      .join(" · ");
  }
  // Neutral fallback — describe the fit plainly without overselling.
  const parts: string[] = [];
  if (match.distanceMilesFromDriverHome != null) {
    parts.push(`${Math.round(match.distanceMilesFromDriverHome)} mi from home`);
  }
  parts.push(`${match.equipment} out of ${match.domicileCity}, ${match.domicileState}`);
  return parts.join(" · ");
}
