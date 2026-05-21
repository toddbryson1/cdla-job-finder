import Link from "next/link";
import { listSeedSlugs } from "@/lib/page-data";
import { parseJobSlug } from "@/lib/slugs";

export default async function Home() {
  const slugs = await listSeedSlugs();

  return (
    <main className="mx-auto max-w-3xl px-5 py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-brand-deep">
        CDLA.jobs
      </h1>
      <p className="mt-3 text-base leading-7 text-brand-muted">
        Class A driver matching. This is the dev home page — the driver-facing
        landing pages live at <code>/jobs/[region]-[equipment]</code>.
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
                  {parsed.equipmentInfo.displayName} in {parsed.regionInfo.displayName}
                </span>
                <span className="font-mono text-xs text-brand-muted">/jobs/{slug}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
