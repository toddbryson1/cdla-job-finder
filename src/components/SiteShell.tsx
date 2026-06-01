import Link from "next/link";

// Driver-facing site chrome (header + footer). Used by the homepage, the
// About page, and any future driver-facing pages that aren't /partners
// (the carrier surface has its own CarrierShell with denser, deep-blue
// styling). Copy here matches SPEC_homepage-copy-v1.md §8 — the same
// footer renders on every driver-facing page so the four-column nav and
// beta acknowledgment are consistent.
//
// Brand wordmark: "CDLA" + Fraunces-leading gold dot + "jobs", per the
// locked design (cdlajobs-homepage-design.html). The dot is structural,
// not punctuation — it's the visual mark of matching.

export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-brand-paper text-brand-ink">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}

// Logo wordmark used in both header and footer — keeps the single source
// of truth for the gold-dot mark.
function Wordmark({ size = "header" }: { size?: "header" | "footer" }) {
  const text = size === "header" ? "text-[22px]" : "text-[22px]";
  return (
    <span
      className={`inline-flex items-baseline gap-px font-display font-semibold tracking-[-0.02em] text-brand-deep ${text}`}
    >
      CDLA
      <span
        aria-hidden="true"
        className="mx-[1px] inline-block h-1.5 w-1.5 -translate-y-px rounded-full bg-brand-gold"
      />
      jobs
    </span>
  );
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-brand-rule bg-brand-paper/85 backdrop-blur">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between px-5 py-[18px] sm:px-8">
        <Link
          href="/"
          aria-label="CDLA.jobs"
          className="transition-colors hover:opacity-90"
        >
          <Wordmark />
        </Link>
        <nav className="flex items-center gap-4 sm:gap-8">
          <Link
            href="/#how-it-works"
            className="hidden text-sm font-medium text-brand-ink transition-colors hover:text-brand-medium sm:inline"
          >
            How it works
          </Link>
          <Link
            href="/#why"
            className="hidden text-sm font-medium text-brand-ink transition-colors hover:text-brand-medium sm:inline"
          >
            Why us
          </Link>
          <Link
            href="/partners"
            className="hidden text-sm font-medium text-brand-ink transition-colors hover:text-brand-medium sm:inline"
          >
            For carriers
          </Link>
          <Link
            href="/#hero"
            className="inline-flex items-center rounded-md bg-brand-deep px-[18px] py-2.5 text-sm font-semibold text-brand-paper transition-colors hover:bg-brand-medium"
          >
            Talk to Debbie
          </Link>
        </nav>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-brand-rule bg-brand-paper">
      <div className="mx-auto max-w-[1200px] px-5 pb-8 pt-16 text-sm sm:px-8">
        <div className="mb-12 grid grid-cols-2 gap-10 sm:gap-12 lg:grid-cols-[2fr_1fr_1fr_1fr]">
          <div className="col-span-2 lg:col-span-1">
            <Wordmark size="footer" />
            <p className="mt-2 max-w-[280px] text-sm text-brand-muted">
              Class A driver matching. Built for drivers.
            </p>
          </div>
          <FooterCol heading="For drivers">
            <FooterLink href="/#how-it-works">How it works</FooterLink>
            <FooterLink href="/#hero">Talk to Debbie</FooterLink>
            <FooterLink href="/intake">Form fallback</FooterLink>
            <FooterLink href="/carriers">Browse carriers</FooterLink>
            <FooterLink href="/faq">FAQ</FooterLink>
          </FooterCol>
          <FooterCol heading="For carriers">
            <FooterLink href="/partners/integration">Integration</FooterLink>
            <FooterLink href="/partners/exclusivity">Exclusivity</FooterLink>
            <FooterLink href="mailto:sales@cdla.jobs" external>
              Contact
            </FooterLink>
          </FooterCol>
          <FooterCol heading="Company">
            <FooterLink href="/about">About</FooterLink>
            <FooterLink href="/privacy">Privacy</FooterLink>
            <FooterLink href="/terms">Terms</FooterLink>
          </FooterCol>
        </div>

        {/* Beta acknowledgment per homepage spec §8.6. */}
        <p className="border-t border-brand-rule py-5 text-center text-sm text-brand-ink">
          CDLA.jobs is new. We&rsquo;re matching drivers and adding carriers
          daily.
        </p>

        {/* Legal row per homepage spec §8.7. */}
        <p className="border-t border-brand-rule pt-4 text-xs leading-[1.6] text-brand-muted">
          &copy; {new Date().getFullYear()} CDLA.jobs. 5300 Sagewood Dr. H552,
          Park City, UT 84098. CDLA.jobs sends SMS and email to drivers who
          consent to receive them. Reply STOP to any text to opt out. Click
          unsubscribe in any email to opt out.
        </p>
      </div>
    </footer>
  );
}

function FooterCol({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="mb-4 text-xs font-bold uppercase tracking-[0.1em] text-brand-ink">
        {heading}
      </h4>
      <ul className="flex flex-col gap-2.5">{children}</ul>
    </div>
  );
}

function FooterLink({
  href,
  external = false,
  children,
}: {
  href: string;
  external?: boolean;
  children: React.ReactNode;
}) {
  const className =
    "text-sm text-brand-muted transition-colors hover:text-brand-deep";
  return (
    <li>
      {external ? (
        <a href={href} className={className}>
          {children}
        </a>
      ) : (
        <Link href={href} className={className}>
          {children}
        </Link>
      )}
    </li>
  );
}
