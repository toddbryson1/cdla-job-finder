import Link from "next/link";

// Shared chrome for /partners/* pages. Desktop-primary, denser than driver
// pages, more deliberate deep-blue palette per
// SPEC_carrier-landing-page-copy-v1.md §7.1.

export function CarrierShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-brand-ink">
      <CarrierHeader />
      <main>{children}</main>
      <CarrierFooter />
    </div>
  );
}

function CarrierHeader() {
  return (
    <header className="border-b border-brand-rule bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-sm font-semibold text-brand-deep">
          CDLA.jobs
        </Link>
        <nav className="flex items-center gap-5 text-sm">
          <Link
            href="/partners/integration"
            className="text-brand-ink hover:text-brand-medium"
          >
            Tier 2 (free)
          </Link>
          <Link
            href="/partners/exclusivity"
            className="text-brand-ink hover:text-brand-medium"
          >
            Tier 1
          </Link>
          <a
            href="mailto:sales@cdla.jobs"
            className="inline-flex h-9 items-center rounded-md bg-brand-deep px-4 text-xs font-semibold text-white hover:bg-brand-medium"
          >
            Talk to sales
          </a>
        </nav>
      </div>
    </header>
  );
}

function CarrierFooter() {
  return (
    <footer className="mt-24 border-t border-brand-rule bg-brand-surface">
      <div className="mx-auto max-w-5xl px-6 py-10 text-sm text-brand-muted">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          <div>
            <p className="font-semibold text-brand-ink">CDLA.jobs</p>
            <p className="mt-2 leading-6">
              Class A driver matching. We&rsquo;re a matching and referral
              service. Carriers make their own hiring decisions.
            </p>
            <p className="mt-3 text-xs">
              In beta. Some platform claims describe the model rather than
              historical performance.
            </p>
          </div>
          <div>
            <p className="font-semibold text-brand-ink">For carriers</p>
            <ul className="mt-2 space-y-1.5">
              <li>
                <Link
                  href="/partners/integration"
                  className="hover:text-brand-ink"
                >
                  Tier 2 (free)
                </Link>
              </li>
              <li>
                <Link
                  href="/partners/exclusivity"
                  className="hover:text-brand-ink"
                >
                  Tier 1 ($2,500/mo)
                </Link>
              </li>
              <li>
                <a
                  href="mailto:sales@cdla.jobs"
                  className="hover:text-brand-ink"
                >
                  Email sales
                </a>
              </li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-brand-ink">For drivers</p>
            <ul className="mt-2 space-y-1.5">
              <li>
                <Link href="/intake" className="hover:text-brand-ink">
                  Start your intake
                </Link>
              </li>
              <li>
                <Link href="/login" className="hover:text-brand-ink">
                  Sign in to your matches
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <p className="mt-10 text-xs">
          &copy; {new Date().getFullYear()} CDLA.jobs. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

// Generic primitives used across both tier pages

export function Section({
  eyebrow,
  heading,
  children,
}: {
  eyebrow?: string;
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-brand-rule">
      <div className="mx-auto max-w-5xl px-6 py-14 sm:py-20">
        {eyebrow ? (
          <p className="text-xs font-medium uppercase tracking-wider text-brand-medium">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-brand-ink sm:text-3xl">
          {heading}
        </h2>
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}

export function PricingTable({
  rows,
}: {
  rows: Array<{ item: string; cost: string }>;
}) {
  return (
    <div className="overflow-hidden rounded-lg border-2 border-brand-deep bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-brand-deep text-white">
          <tr>
            <th className="px-5 py-3 font-semibold">Item</th>
            <th className="px-5 py-3 font-semibold">Cost</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-brand-rule">
          {rows.map((r) => (
            <tr key={r.item}>
              <td className="px-5 py-3 text-brand-ink">{r.item}</td>
              <td className="px-5 py-3 font-mono font-semibold text-brand-deep">
                {r.cost}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Faq({
  items,
}: {
  items: Array<{ q: string; a: React.ReactNode }>;
}) {
  return (
    <dl className="divide-y divide-brand-rule rounded-lg border border-brand-rule bg-white">
      {items.map((it) => (
        <div key={it.q} className="px-5 py-5">
          <dt className="text-sm font-semibold text-brand-ink">{it.q}</dt>
          <dd className="mt-2 text-sm leading-6 text-brand-ink">{it.a}</dd>
        </div>
      ))}
    </dl>
  );
}

export function CrossTierLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-10 border-t border-brand-rule pt-6">
      <Link
        href={href}
        className="text-sm font-medium text-brand-medium hover:text-brand-deep"
      >
        {children} &rarr;
      </Link>
    </div>
  );
}
