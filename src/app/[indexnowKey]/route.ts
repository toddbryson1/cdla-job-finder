import { notFound } from "next/navigation";

// IndexNow key verification file. IndexNow requires the key to be
// served at the site root as <key>.txt. We use a dynamic single-segment
// route that responds only when the requested path matches the
// configured INDEXNOW_KEY env var.
//
// Side effect: this catches every unmatched single-segment URL at the
// site root. Such URLs would 404 anyway under Next.js default routing —
// the only behavior change is that the 404 now comes from this handler
// rather than Next.js's built-in not-found page.
//
// All existing root-level routes (/about, /faq, /partners, /jobs,
// /job, /articles, /intake, /login, /authenticate, /sitemap.xml,
// /robots.txt, /privacy, /terms) are static or folder-based and win
// over this dynamic segment.

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ indexnowKey: string }> },
) {
  const { indexnowKey } = await params;
  const expected = process.env.INDEXNOW_KEY?.trim();
  if (!expected) notFound();
  if (indexnowKey !== `${expected}.txt`) notFound();

  return new Response(expected, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
