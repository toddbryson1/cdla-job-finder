import Link from "next/link";
import { listSeedSlugs } from "@/lib/page-data";
import { parseJobSlug } from "@/lib/slugs";

// Dev-only landing index. Moved off of `/` when the real homepage shipped.
// Lists every seeded /jobs/[region-equipment] landing page so engineers can
// navigate them quickly. Not linked from anywhere visitor-facing; not
// noindexed because robots won't find it.

export const metadata = {
  title: "Dev index — CDLA.jobs",
  robots: { index: false, follow: false },
};

export default async function DevIndex() {
  const slugs = await listSeedSlugs();
  return (
    <main className="mx-auto max-w-3xl px-5 py-16">
      <p className="text-sm font-medium text-brand-medium">CDLA.jobs / dev</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-brand-deep">
        Dev index
      </h1>
      <p className="mt-3 text-base leading-7 text-brand-muted">
        Quick navigation for engineering. The public homepage lives at{" "}
        <Link href="/" className="underline">
          /
        </Link>
        .
      </p>

      <h2 className="mt-10 text-lg font-semibold text-brand-ink">
        Seed landing pages
      </h2>
      <ul className="mt-3 divide-y divide-brand-rule rounded-xl border border-brand-rule bg-white">
        {slugs.map((slug) => {
          const parsed = parseJobSlug(slug);
          if (!parsed) return null;
          return (
            <li key={slug}>
              <Link
                href={`/jobs/${slug}`}
                className="flex items-center justify-between p-4 hover:bg-brand-surface"
              >
                <span className="text-brand-ink">
                  {parsed.equipmentInfo.displayName} in{" "}
                  {parsed.regionInfo.displayName}
                </span>
                <span className="font-mono text-xs text-brand-muted">
                  /jobs/{slug}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <h2 className="mt-10 text-lg font-semibold text-brand-ink">Routes</h2>
      <ul className="mt-3 divide-y divide-brand-rule rounded-xl border border-brand-rule bg-white text-sm">
        <li>
          <Link
            href="/intake"
            className="block p-4 hover:bg-brand-surface"
          >
            /intake &mdash; driver intake form
          </Link>
        </li>
        <li>
          <Link
            href="/login"
            className="block p-4 hover:bg-brand-surface"
          >
            /login &mdash; magic-link sign in
          </Link>
        </li>
        <li>
          <Link
            href="/partners"
            className="block p-4 hover:bg-brand-surface"
          >
            /partners &mdash; carrier landing index
          </Link>
        </li>
        <li>
          <Link
            href="/partners/integration"
            className="block p-4 hover:bg-brand-surface"
          >
            /partners/integration &mdash; Tier 2 page
          </Link>
        </li>
        <li>
          <Link
            href="/partners/exclusivity"
            className="block p-4 hover:bg-brand-surface"
          >
            /partners/exclusivity &mdash; Tier 1 page
          </Link>
        </li>
        <li>
          <Link
            href="/partners/brief"
            className="block p-4 hover:bg-brand-surface"
          >
            /partners/brief &mdash; gated carrier brief
          </Link>
        </li>
      </ul>
    </main>
  );
}
