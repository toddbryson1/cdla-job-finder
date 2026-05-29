import Link from "next/link";

// Driver-facing site chrome (header + footer). Used by the homepage, the
// About page, and any future driver-facing pages that aren't /partners
// (the carrier surface has its own CarrierShell with denser, deep-blue
// styling). Copy here matches SPEC_homepage-copy-v1.md §8 — the same
// footer renders on every driver-facing page so the four-column nav and
// beta acknowledgment are consistent.

export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-brand-ink">
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}

function SiteHeader() {
  return (
    <header className="border-b border-brand-rule bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <Link href="/" className="text-base font-semibold text-brand-deep">
          CDLA.jobs
        </Link>
        <nav className="flex items-center gap-5 text-sm">
          <Link
            href="/partners"
            className="text-brand-muted hover:text-brand-ink"
          >
            For carriers
          </Link>
          <Link
            href="/login"
            className="text-brand-muted hover:text-brand-ink"
          >
            Sign in
          </Link>
          <Link
            href="/intake"
            className="inline-flex h-9 items-center rounded-md bg-brand-deep px-4 text-xs font-semibold text-white hover:bg-brand-medium"
          >
            Start
          </Link>
        </nav>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-brand-rule bg-white">
      <div className="mx-auto max-w-6xl px-5 py-12 text-sm">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="font-semibold text-brand-deep">CDLA.jobs</p>
            <p className="mt-2 text-brand-muted">
              Class A driver matching. Built for drivers.
            </p>
          </div>
          <div>
            <p className="font-semibold text-brand-ink">For drivers</p>
            <ul className="mt-2 space-y-1.5 text-brand-muted">
              <li>
                <Link href="/#how-it-works" className="hover:text-brand-ink">
                  How it works
                </Link>
              </li>
              <li>
                <Link href="/" className="hover:text-brand-ink">
                  Talk to Debbie
                </Link>
              </li>
              <li>
                <Link href="/intake" className="hover:text-brand-ink">
                  Start the form
                </Link>
              </li>
              <li>
                <Link href="/carriers" className="hover:text-brand-ink">
                  Browse carriers
                </Link>
              </li>
              <li>
                <Link href="/faq" className="hover:text-brand-ink">
                  FAQ
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-brand-ink">For carriers</p>
            <ul className="mt-2 space-y-1.5 text-brand-muted">
              <li>
                <Link
                  href="/partners/integration"
                  className="hover:text-brand-ink"
                >
                  Integration
                </Link>
              </li>
              <li>
                <Link
                  href="/partners/exclusivity"
                  className="hover:text-brand-ink"
                >
                  Exclusivity
                </Link>
              </li>
              <li>
                <a
                  href="mailto:sales@cdla.jobs"
                  className="hover:text-brand-ink"
                >
                  Contact
                </a>
              </li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-brand-ink">Company &amp; legal</p>
            <ul className="mt-2 space-y-1.5 text-brand-muted">
              <li>
                <Link href="/about" className="hover:text-brand-ink">
                  About
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-brand-ink">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-brand-ink">
                  Terms of Service
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Beta acknowledgment per homepage spec §8.6. */}
        <p className="mt-10 border-t border-brand-rule pt-6 text-brand-ink">
          CDLA.jobs is new. We&rsquo;re matching drivers and adding carriers
          daily.
        </p>

        {/* Legal row per homepage spec §8.7. */}
        <p className="mt-4 text-xs leading-5 text-brand-muted">
          &copy; {new Date().getFullYear()} CDLA.jobs. 5300 Sagewood Dr. H552,
          Park City, UT 84098. CDLA.jobs sends SMS and email to drivers who
          consent to receive them. Reply STOP to any text to opt out. Click
          unsubscribe in any email to opt out.
        </p>
      </div>
    </footer>
  );
}
