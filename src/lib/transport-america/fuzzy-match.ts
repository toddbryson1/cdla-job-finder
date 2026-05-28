// Fuzzy match the openings sheet's Division strings to the detail
// workbook's tab names. Per spec §5.1.
//
// Why fuzzy: the openings sheet's free-text Division strings carry
// noise the tab names don't have — punctuation ("-", "/", ","),
// abbreviation variants ("AAP/CQ" vs "AA/Carquest"), and trailing
// role/shift suffixes ("Solo", "Flex", "Team", "Shuttle") that are
// optional in tab names.
//
// Approach (per spec §5.1):
//   1. Normalize both strings
//   2. Score similarity (token-set Jaccard + token-sort ratio average)
//   3. Confidence threshold filters out uncertain matches
//   4. Below threshold → unresolved, surfaces in the human-review report

import type { MatchResult, OpeningRow } from "./types";

// Default confidence threshold. Open question #1 in spec §11.
// 0.6 is "the same words in mostly the same order"; 0.8 is "very
// confident match". 0.65 starts strict-ish; we'll relax if the
// match-report shows too many false negatives.
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.65;

// Known abbreviation expansions (spec §5.1). Adding more here lowers
// false-negative rates as we see the match report.
const ABBREVIATIONS: Record<string, string> = {
  aap: "aa",
  cq: "carquest",
  ns: "norfolk southern",
  nfs: "norfolk southern",
  vwr: "vwr",
};

// Role suffixes that show up in both openings AND tab names —
// they're a SIGNAL not noise. If both sides have one and they differ
// (Solo vs Team), they're different jobs and should score lower.
// We keep them in the normalized string.
const ROLE_TOKENS = new Set([
  "solo",
  "team",
  "flex",
  "shuttle",
  "feeder",
  "outbound",
  "inbound",
]);

function normalize(s: string): string {
  let out = s.toLowerCase();
  // Drop parentheticals — driver counts, shift notes, etc.
  out = out.replace(/\([^)]*\)/g, " ");
  // Expand abbreviations (multi-word too: "norfolk southern" stays
  // as two tokens after this; the simple per-token expansion above
  // doesn't handle multi-token expansions but we don't need it yet).
  out = out
    .split(/\s+/)
    .map((tok) => ABBREVIATIONS[tok] ?? tok)
    .join(" ");
  // Drop punctuation, normalize whitespace
  out = out.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  return out;
}

/**
 * Return the role-tokens present in a normalized string (subset of
 * ROLE_TOKENS). Used to penalize matches where both sides specify
 * a role but the roles disagree.
 */
function extractRoles(s: string): Set<string> {
  const out = new Set<string>();
  for (const tok of s.split(/\s+/)) {
    if (ROLE_TOKENS.has(tok)) out.add(tok);
  }
  return out;
}

function tokens(s: string): Set<string> {
  return new Set(s.split(/\s+/).filter((t) => t.length > 1));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Token-sort ratio: sort tokens alphabetically then compare as
 * strings via Levenshtein-derived similarity. Robust to word order.
 */
function tokenSortRatio(a: string, b: string): number {
  const sa = [...a.split(/\s+/)].sort().join(" ");
  const sb = [...b.split(/\s+/)].sort().join(" ");
  return stringSimilarity(sa, sb);
}

function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const prev: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prevDiag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        prevDiag + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prevDiag = tmp;
    }
  }
  return prev[b.length];
}

/**
 * Score one (opening division, tab name) pair.
 * Returns a confidence in [0, 1].
 *
 * Scoring blend:
 *   - 0.5 × token-set Jaccard           — overlap of words
 *   - 0.5 × token-sort ratio            — character similarity once sorted
 *
 * Plus a role-disagreement penalty: if both sides specify a role
 * (solo/team/flex/shuttle/feeder) and the roles differ, multiply the
 * score by ROLE_DISAGREEMENT_PENALTY. This catches the "Honda Valdosta
 * GA Solo" vs "Honda Valdosta GA Team" case where everything else
 * matches but they're different jobs.
 */
const ROLE_DISAGREEMENT_PENALTY = 0.7;

export function scoreMatch(division: string, tabName: string): number {
  const na = normalize(division);
  const nb = normalize(tabName);
  if (na.length === 0 || nb.length === 0) return 0;
  const j = jaccard(tokens(na), tokens(nb));
  const ts = tokenSortRatio(na, nb);
  let score = (j + ts) / 2;

  // Role-disagreement penalty
  const rolesA = extractRoles(na);
  const rolesB = extractRoles(nb);
  if (rolesA.size > 0 && rolesB.size > 0) {
    // Both sides specify a role. Do they agree on any?
    let agreed = false;
    for (const r of rolesA) {
      if (rolesB.has(r)) {
        agreed = true;
        break;
      }
    }
    if (!agreed) {
      score *= ROLE_DISAGREEMENT_PENALTY;
    }
  }

  return score;
}

/**
 * Match one opening against all detail tab names.
 */
export function matchOpening(
  opening: OpeningRow,
  detailTabNames: string[],
  threshold: number = DEFAULT_CONFIDENCE_THRESHOLD,
): MatchResult {
  const scored = detailTabNames
    .map((tab) => ({ tabName: tab, score: scoreMatch(opening.division, tab) }))
    .sort((a, b) => b.score - a.score);

  const top = scored[0];
  const notes: string[] = [];

  // Check for "tied" matches — if the top 2 scores are within 0.05,
  // we don't trust the choice and mark unresolved.
  const tied = scored.length >= 2 && top.score - scored[1].score < 0.05;
  if (tied) {
    notes.push(
      `top 2 candidates within 0.05 (${top.score.toFixed(2)} vs ${scored[1].score.toFixed(2)})`,
    );
  }

  const isResolved = !tied && top.score >= threshold;
  if (!isResolved && top.score < threshold) {
    notes.push(`best score ${top.score.toFixed(2)} below threshold ${threshold}`);
  }

  return {
    opening,
    matchedTabName: isResolved ? top.tabName : null,
    confidence: top.score,
    candidates: scored.slice(0, 3),
    isResolved,
    notes,
  };
}

/**
 * Match all openings. Returns one MatchResult per opening.
 */
export function matchAllOpenings(
  openings: OpeningRow[],
  detailTabNames: string[],
  threshold: number = DEFAULT_CONFIDENCE_THRESHOLD,
): MatchResult[] {
  return openings.map((o) => matchOpening(o, detailTabNames, threshold));
}
