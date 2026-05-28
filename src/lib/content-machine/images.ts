// AI image generation + storage for content-machine articles.
//
// Pipeline per article:
//   1. Build two prompts from the topic/region/bucket (no second LLM call —
//      templates here, kept simple and predictable).
//   2. Call OpenAI gpt-image-1 twice (one hero 16:9-ish, one inline 1:1).
//      Returns base64 PNG bytes.
//   3. Upload both to Vercel Blob; return public URLs + the prompts.
//
// Failure mode: any error throws — the orchestrator catches and continues
// without images. We never block publish on image-gen.
//
// Cost: ~$0.04/image standard, $0.08 was the limit. 2/article * 365 = $30/yr.

import { put } from "@vercel/blob";
import OpenAI from "openai";

export const IMAGE_MODEL = "gpt-image-1";

export interface GeneratedImagePair {
  heroUrl: string;
  heroPrompt: string;
  inlineUrl: string;
  inlinePrompt: string;
}

export interface ImageInput {
  articleId: string;
  topic: string;
  region: string | null;
  bucket: 1 | 2 | 3 | 4;
}

const BUCKET_STYLE_HINTS: Record<number, string> = {
  1: "honest, working-class American trucking, no flashy luxury imagery",
  2: "professional, hopeful, focused — a driver early in or planning their career",
  3: "real life-on-the-road texture — truck stops, parking, sleeper cabs, healthy choices",
  4: "documentary-style, slightly journalistic, no logos or named brands",
};

function buildHeroPrompt(input: ImageInput): string {
  const place = input.region
    ? `Set in or near ${input.region}.`
    : "Set somewhere in the United States, not city-specific.";
  return [
    "Wide-format photojournalism-style photograph, 3:2 aspect ratio.",
    `Subject: A scene that visually communicates the article topic: "${input.topic}".`,
    "Style: natural lighting, slightly cinematic, realistic photo (not illustration, not 3D render).",
    "Subject should feel authentic to American long-haul Class A trucking — semi trucks, freight, truck stops, highway, professional drivers in workwear.",
    BUCKET_STYLE_HINTS[input.bucket],
    place,
    "No text, logos, brand names, or watermarks anywhere in the image.",
    "No deformed hands or faces; if showing a driver, prefer wide shots or backs of figures over closeups.",
  ].join(" ");
}

function buildInlinePrompt(input: ImageInput): string {
  return [
    "Square photograph, 1:1 aspect ratio, photojournalism style.",
    `A complementary scene to the article topic: "${input.topic}".`,
    "Detail-oriented — a hand on a steering wheel, a logbook, an open hood, truck stop signage, freight at a dock — choose what fits the topic.",
    "Natural lighting, realistic photo.",
    "No text, logos, brand names, or watermarks.",
    BUCKET_STYLE_HINTS[input.bucket],
  ].join(" ");
}

async function generateOneImage(
  client: OpenAI,
  prompt: string,
  size: "1536x1024" | "1024x1024",
): Promise<Buffer> {
  const res = await client.images.generate({
    model: IMAGE_MODEL,
    prompt,
    size,
    n: 1,
  });
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI returned no image data");
  return Buffer.from(b64, "base64");
}

async function uploadToBlob(
  articleId: string,
  filename: string,
  png: Buffer,
): Promise<string> {
  const path = `content-machine/${articleId}/${filename}`;
  const { url } = await put(path, png, {
    access: "public",
    contentType: "image/png",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return url;
}

export async function generateArticleImages(
  input: ImageInput,
): Promise<GeneratedImagePair> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not set");
  }
  const client = new OpenAI({ apiKey });

  const heroPrompt = buildHeroPrompt(input);
  const inlinePrompt = buildInlinePrompt(input);

  // Generate both in parallel — keeps wall time under one slow call's worth.
  const [heroPng, inlinePng] = await Promise.all([
    generateOneImage(client, heroPrompt, "1536x1024"),
    generateOneImage(client, inlinePrompt, "1024x1024"),
  ]);

  // Upload sequentially is fine; Blob is fast.
  const heroUrl = await uploadToBlob(input.articleId, "hero.png", heroPng);
  const inlineUrl = await uploadToBlob(input.articleId, "inline.png", inlinePng);

  return { heroUrl, heroPrompt, inlineUrl, inlinePrompt };
}
