// Anthropic call + structured-output parser for the content machine.
//
// Architecture:
//   - One API call per (bucket, topic, region) triple. The N picks for a
//     daily run are dispatched in parallel by the caller (Promise.all).
//   - System prompt = the canonical article prompt at
//     docs/CDLAjobs_Daily_Article_Prompt.md, with a JSON-envelope
//     appendix added at runtime. The canonical doc is the source of
//     truth and not modified.
//   - System block uses prompt caching (cache_control: ephemeral) so all
//     N parallel calls per run share the cached system prefix.
//   - The model produces (a) the natural article in Section 5 format
//     and (b) a fenced ```json``` envelope at the very end. We parse
//     the envelope; the natural-form text stays in body_markdown for
//     readability in the daily email.
//   - If JSON parsing fails, throw — the caller's retry-once policy
//     (spec Section 8) handles transient flakes.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

export const DEFAULT_MODEL = "claude-sonnet-4-6";

export interface GenerateArticleInput {
  bucket: 1 | 2 | 3 | 4;
  topic: string;
  region: { city: string; state: string } | null; // null = national
  verifiedData: string | null; // freeform paste of pay/rate figures, or null
}

export interface ParsedArticle {
  workingTitle: string;
  slug: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  titleTag: string;
  metaDescription: string;
  bodyMarkdown: string;
  honestCaveat: string;
  internalLinks: Array<{ anchor: string; targetType: string }>;
  ctaBlock: string;
  faq: Array<{ question: string; answer: string }>;
  faqSchemaJsonld: string;
  reviewFlags: string;
}

export interface GeneratedArticle extends ParsedArticle {
  bucket: 1 | 2 | 3 | 4;
  topic: string;
  region: string | null; // "City, ST" or null
  wordCount: number;
  llmModel: string;
  rawResponse: string; // full text including the natural form + JSON
  tokens: { input: number; output: number };
}

// Zod schema for the JSON envelope. internalLinks and faq are arrays of
// small objects; tolerate empty arrays since some article shapes legit
// have neither (the spec asks for 3-6 links and 5-8 FAQs but we don't
// hard-fail on count mismatches — that's a quality concern, not a
// publish blocker).
const ArticleEnvelope = z.object({
  workingTitle: z.string().min(3),
  slug: z.string().min(3),
  primaryKeyword: z.string().min(2),
  secondaryKeywords: z.array(z.string()).default([]),
  titleTag: z.string().min(3),
  metaDescription: z.string().min(3),
  bodyMarkdown: z.string().min(100),
  honestCaveat: z.string().default(""),
  internalLinks: z
    .array(
      z.object({
        anchor: z.string(),
        targetType: z.string(),
      }),
    )
    .default([]),
  ctaBlock: z.string().default(""),
  faq: z
    .array(z.object({ question: z.string(), answer: z.string() }))
    .default([]),
  faqSchemaJsonld: z.string().default(""),
  reviewFlags: z.string().default(""),
});

const JSON_ENVELOPE_APPENDIX = `

---

## Output format addendum (machine-readable)

After producing all of the natural Section 5 elements and the REVIEW FLAGS block, append **one final fenced \`\`\`json code block** containing a structured envelope of the article so it can be programmatically parsed. The envelope is the source of truth for what gets saved to the database — the natural-form text above is for the human reviewer's daily email.

The envelope shape (strict — extra fields are ignored, missing required fields fail validation):

\`\`\`json
{
  "workingTitle": "string",
  "slug": "kebab-case-string",
  "primaryKeyword": "string",
  "secondaryKeywords": ["string", "string"],
  "titleTag": "string (<=60 chars)",
  "metaDescription": "string (<=155 chars)",
  "bodyMarkdown": "full article body as markdown — H1, body paragraphs, H2/H3 subheadings, internal-link markers, CTA, and the FAQ section all inline. Do NOT include the title tag, meta description, or the JSON-LD schema in this field.",
  "honestCaveat": "the honest-caveat section text as markdown",
  "internalLinks": [
    { "anchor": "descriptive anchor text", "targetType": "region-equipment landing page" }
  ],
  "ctaBlock": "the CTA text",
  "faq": [
    { "question": "How do drivers actually search for this?", "answer": "Concise answer in first sentence, then expansion." }
  ],
  "faqSchemaJsonld": "the FAQPage JSON-LD as a string — must parse as valid JSON and the on-page FAQ text must match exactly",
  "reviewFlags": "the full REVIEW FLAGS block as text, or empty string if nothing to flag"
}
\`\`\`

Output the natural form first (Section 5 elements 1–10 in order, then REVIEW FLAGS), and the JSON envelope **last** as a single fenced block. The parser extracts the **final** \`\`\`json … \`\`\` block in your response.`;

let cachedArticlePrompt: string | null = null;
async function loadArticlePrompt(): Promise<string> {
  if (cachedArticlePrompt) return cachedArticlePrompt;
  const path = join(
    process.cwd(),
    "docs",
    "CDLAjobs_Daily_Article_Prompt.md",
  );
  cachedArticlePrompt = await readFile(path, "utf8");
  return cachedArticlePrompt;
}

function regionLabel(
  region: GenerateArticleInput["region"],
): string {
  if (!region) return "national";
  return `${region.city}, ${region.state}`;
}

function buildUserMessage(input: GenerateArticleInput): string {
  const r = regionLabel(input.region);
  const data = input.verifiedData?.trim()
    ? input.verifiedData.trim()
    : "none";
  return `Generate one article from Bucket ${input.bucket} on the topic: ${input.topic}. Target region: ${r}. Verified data available: ${data}.`;
}

/**
 * Extract the final fenced ```json block from a model response. Returns
 * the JSON string (no fences). Throws if none found.
 */
export function extractFinalJsonBlock(text: string): string {
  // Match all ```json ... ``` blocks (case-insensitive on the language
  // tag, dotAll for multiline body). Take the last one — the appendix
  // tells the model the envelope must be last.
  const re = /```\s*json\s*\n([\s\S]*?)\n\s*```/gi;
  const matches = [...text.matchAll(re)];
  if (matches.length === 0) {
    throw new Error("No fenced JSON block found in model response");
  }
  return matches[matches.length - 1][1].trim();
}

export function parseEnvelope(jsonString: string): ParsedArticle {
  const raw = JSON.parse(jsonString) as unknown;
  const parsed = ArticleEnvelope.parse(raw);
  return parsed;
}

function countWords(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Generate one article. Throws on any failure (network, parse, schema).
 * The caller's retry-once policy decides whether to call us again.
 */
export async function generateArticle(
  input: GenerateArticleInput,
): Promise<GeneratedArticle> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const model = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
  const client = new Anthropic({ apiKey });

  const basePrompt = await loadArticlePrompt();
  const systemBlocks = [
    {
      type: "text" as const,
      text: basePrompt + JSON_ENVELOPE_APPENDIX,
      cache_control: { type: "ephemeral" as const },
    },
  ];

  const userText = buildUserMessage(input);

  const res = await client.messages.create({
    model,
    max_tokens: 8000,
    system: systemBlocks,
    messages: [{ role: "user", content: userText }],
  });

  const block = res.content[0];
  if (!block || block.type !== "text") {
    throw new Error("Anthropic returned no text content block");
  }
  const raw = block.text;

  const jsonStr = extractFinalJsonBlock(raw);
  const parsed = parseEnvelope(jsonStr);

  return {
    ...parsed,
    bucket: input.bucket,
    topic: input.topic,
    region: input.region ? regionLabel(input.region) : null,
    wordCount: countWords(parsed.bodyMarkdown),
    llmModel: model,
    rawResponse: raw,
    tokens: {
      input: res.usage.input_tokens,
      output: res.usage.output_tokens,
    },
  };
}

/**
 * Placeholder-rewrite call (spec Section 4.2). When a generated article
 * contains [INSERT VERIFIED STAT], we ask the model to rewrite the
 * affected paragraphs to omit the figure and re-frame in general terms.
 * Returns the rewritten ParsedArticle (same envelope shape).
 */
export async function rewriteToRemovePlaceholders(
  article: ParsedArticle,
  llmModel: string,
): Promise<ParsedArticle> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const client = new Anthropic({ apiKey });

  const instructions = `The article below contains one or more [INSERT VERIFIED STAT] placeholders. You must rewrite the affected paragraphs so that EVERY placeholder is removed. The rule:

- Do not invent a number to fill the placeholder.
- Reframe the point in general, qualitative terms ("drivers in this lane typically see strong demand" instead of "drivers in this lane see [INSERT VERIFIED STAT] loads per week").
- Preserve the article's meaning, structure, and voice. Touch only the paragraphs that contain a placeholder.
- The honest-caveat section should still acknowledge what the data does not cover.

Output the rewritten article as a single fenced \`\`\`json code block with the same envelope shape as the input (workingTitle, slug, primaryKeyword, secondaryKeywords, titleTag, metaDescription, bodyMarkdown, honestCaveat, internalLinks, ctaBlock, faq, faqSchemaJsonld, reviewFlags). Update reviewFlags to note the placeholder was removed and why.

ORIGINAL ARTICLE ENVELOPE:

\`\`\`json
${JSON.stringify(article, null, 2)}
\`\`\``;

  const res = await client.messages.create({
    model: llmModel,
    max_tokens: 8000,
    messages: [{ role: "user", content: instructions }],
  });
  const block = res.content[0];
  if (!block || block.type !== "text") {
    throw new Error("Anthropic returned no text content block on rewrite");
  }
  const jsonStr = extractFinalJsonBlock(block.text);
  return parseEnvelope(jsonStr);
}
