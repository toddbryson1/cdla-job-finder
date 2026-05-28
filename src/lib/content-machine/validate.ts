// Pre-publish validation for generated articles. Two concerns:
//
//   1. Placeholder handling (spec §4.2) — [INSERT VERIFIED STAT] must
//      never reach the live site. The caller performs the rewrite call;
//      this module just detects + re-scans.
//
//   2. Advisory content checks (spec §4.3) — word count, title/meta
//      length, FAQ schema JSON validity, emoji-anywhere, blocked
//      competitor names. Most are hard failures; title_tag and
//      meta_description over-length are *fixed* (truncated at word
//      boundary) and a warning is appended to reviewFlags.
//
// Returns a ValidationResult with the (possibly fixed) article and a
// list of human-readable warnings + failure reasons.

import { BLOCKED_TERMS } from "./blocked-terms";
import type { ParsedArticle } from "./llm";

export const PLACEHOLDER = "[INSERT VERIFIED STAT]";

export const TITLE_TAG_MAX = 60;
export const META_DESC_MAX = 155;
export const WORD_COUNT_MIN = 800;
export const WORD_COUNT_MAX = 1500;

export interface ValidationResult {
  ok: boolean;
  fixedArticle: ParsedArticle;
  warnings: string[];
  failureReasons: string[];
}

export function hasPlaceholder(article: ParsedArticle): boolean {
  return [article.bodyMarkdown, article.honestCaveat, article.ctaBlock].some(
    (s) => s.includes(PLACEHOLDER),
  );
}

// Word boundary truncation. Cuts at the last whitespace before `max`
// chars. Returns the original string if it's already short enough.
export function truncateAtWordBoundary(s: string, max: number): string {
  if (s.length <= max) return s;
  const slice = s.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace <= 0) return slice;
  return slice.slice(0, lastSpace);
}

// Emoji detection. The Unicode \p{Emoji} property catches most
// pictographs; the explicit ZWJ + variation selectors catch the joiners
// that compose multi-codepoint emoji sequences. Some glyphs like ™ and
// © also match \p{Emoji}, so we accept those few text-presentation cases
// (they're legitimate brand text, not emoji).
const ALLOWED_PSEUDO_EMOJI = new Set(["™", "©", "®", "℠"]);
export function containsEmoji(s: string): boolean {
  // \p{Extended_Pictographic} is the safer property for "is this a real
  // emoji" — narrower than \p{Emoji} which includes digits.
  const re = /\p{Extended_Pictographic}/gu;
  for (const m of s.matchAll(re)) {
    if (!ALLOWED_PSEUDO_EMOJI.has(m[0])) return true;
  }
  return false;
}

// Case-insensitive whole-word match for any blocked term in the body.
export function findBlockedTerms(body: string): string[] {
  const hits: string[] = [];
  for (const term of BLOCKED_TERMS) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${escaped}\\b`, "i");
    if (re.test(body)) hits.push(term);
  }
  return hits;
}

export function countWords(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function jsonValid(s: string): boolean {
  if (!s.trim()) return true; // empty is fine — caller can decide
  try {
    JSON.parse(s);
    return true;
  } catch {
    return false;
  }
}

/**
 * Runs all advisory checks against an article, applies in-place fixes
 * (title/meta truncation), and returns the verdict.
 *
 * Note: placeholder scanning is NOT done here — see hasPlaceholder().
 * The caller orchestrates the rewrite/re-scan flow per §4.2.
 */
export function validateAndFix(article: ParsedArticle): ValidationResult {
  const warnings: string[] = [];
  const failureReasons: string[] = [];
  let fixed = { ...article };

  // Word count
  const wc = countWords(article.bodyMarkdown);
  if (wc < WORD_COUNT_MIN) {
    failureReasons.push(
      `Word count ${wc} below minimum ${WORD_COUNT_MIN}`,
    );
  } else if (wc > WORD_COUNT_MAX) {
    failureReasons.push(
      `Word count ${wc} above maximum ${WORD_COUNT_MAX}`,
    );
  }

  // Title tag length — fix + warn, don't fail
  if (article.titleTag.length > TITLE_TAG_MAX) {
    const truncated = truncateAtWordBoundary(article.titleTag, TITLE_TAG_MAX);
    warnings.push(
      `title_tag was ${article.titleTag.length} chars, truncated to ${truncated.length}: "${truncated}"`,
    );
    fixed = { ...fixed, titleTag: truncated };
  }

  // Meta description length — fix + warn, don't fail
  if (article.metaDescription.length > META_DESC_MAX) {
    const truncated = truncateAtWordBoundary(
      article.metaDescription,
      META_DESC_MAX,
    );
    warnings.push(
      `meta_description was ${article.metaDescription.length} chars, truncated to ${truncated.length}: "${truncated}"`,
    );
    fixed = { ...fixed, metaDescription: truncated };
  }

  // FAQ schema JSON-LD validity
  if (article.faqSchemaJsonld && !jsonValid(article.faqSchemaJsonld)) {
    failureReasons.push("faq_schema_jsonld is not valid JSON");
  }

  // Emoji anywhere — checks every string field that gets published
  const stringFields: Array<[string, string]> = [
    ["title", article.workingTitle],
    ["titleTag", fixed.titleTag],
    ["metaDescription", fixed.metaDescription],
    ["primaryKeyword", article.primaryKeyword],
    ["bodyMarkdown", article.bodyMarkdown],
    ["honestCaveat", article.honestCaveat],
    ["ctaBlock", article.ctaBlock],
    ["faqSchemaJsonld", article.faqSchemaJsonld],
    ...article.secondaryKeywords.map(
      (k, i) => [`secondaryKeywords[${i}]`, k] as [string, string],
    ),
    ...article.faq.flatMap((f, i) => [
      [`faq[${i}].question`, f.question] as [string, string],
      [`faq[${i}].answer`, f.answer] as [string, string],
    ]),
  ];
  for (const [field, value] of stringFields) {
    if (containsEmoji(value)) {
      failureReasons.push(`Emoji detected in ${field}`);
    }
  }

  // Blocked competitor names
  const hits = findBlockedTerms(article.bodyMarkdown);
  if (hits.length > 0) {
    failureReasons.push(`Blocked competitor name(s) in body: ${hits.join(", ")}`);
  }

  return {
    ok: failureReasons.length === 0,
    fixedArticle: fixed,
    warnings,
    failureReasons,
  };
}
