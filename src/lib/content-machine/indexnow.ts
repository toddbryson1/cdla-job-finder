// IndexNow submission for the content machine. After every successful
// publish, the URL is POSTed to api.indexnow.org/IndexNow which
// fan-outs to participating search engines (Bing, Yandex, Seznam,
// Naver, Yep). The key file must be served at the site root —
// /<INDEXNOW_KEY>.txt — see src/app/[indexnowKey]/route.ts.
//
// Spec: https://www.indexnow.org/documentation

import { SITE_ORIGIN } from "./publish";

export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/IndexNow";
export const INDEXNOW_HOST = "cdla.jobs";

export interface IndexNowResult {
  ok: boolean;
  status: number;
  body: string;
}

/**
 * Submit one or more URLs to IndexNow. Per the spec, 200 means success,
 * 202 means accepted-but-not-yet-processed. Both are treated as ok.
 * Non-2xx statuses (400/403/422/429) get returned as ok=false so the
 * caller can include in the daily report.
 */
export async function submitToIndexNow(
  urls: string[],
): Promise<IndexNowResult> {
  const key = process.env.INDEXNOW_KEY?.trim();
  if (!key) {
    return {
      ok: false,
      status: 0,
      body: "INDEXNOW_KEY is not set",
    };
  }

  const body = {
    host: INDEXNOW_HOST,
    key,
    keyLocation: `${SITE_ORIGIN}/${key}.txt`,
    urlList: urls,
  };

  let res: Response;
  try {
    res = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return {
      ok: false,
      status: 0,
      body: `network error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const text = await res.text();
  const ok = res.status === 200 || res.status === 202;
  return { ok, status: res.status, body: text };
}
