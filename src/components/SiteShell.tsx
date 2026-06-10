import Link from "next/link";
import { cookies } from "next/headers";
import { MobileTabBar } from "@/components/MobileTabBar";

const HEADER_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

export async function SiteShell({ children }: { children: React.ReactNode }) {
  // Read the anonymous-intake cookie once at the shell level so the
  // header CTA can swap from "Talk to Debbie" → "My matches" for any
  // driver who's already in the system. No DB query — we trust the
  // cookie value as a URL parameter; /matches re-validates it.
  const cookieStore = await cookies();
  const cookieDriverId = cookieStore.get("cdla_driver_id")?.value ?? null;
  const driverIdForNav =
    cookieDriverId && HEADER_UUID_RE.test(cookieDriverId)
      ? cookieDriverId
      : null;
  // Tab targets resolve off the same cookie the header uses. A returning
  // driver's Jobs/Profile tabs go straight to their matches and dashboard;
  // a new visitor browses carriers and signs in. Chat always points at the
  // homepage Debbie hero.
  const jobsHref = driverIdForNav ? `/matches/${driverIdForNav}` : "/carriers";
  const profileHref = driverIdForNav ? "/me" : "/login?redirect=/me";

  return (
    <div className="flex min-h-screen flex-col bg-brand-paper text-brand-ink">
      <SiteHeader driverIdForNav={driverIdForNav} />
      {/* pb-16 on mobile keeps content clear of the fixed bottom tab bar. */}
      <main className="flex-1 pb-16 sm:pb-0">{children}</main>
      <SiteFooter />
      <MobileTabBar
        chatHref="/#hero"
        jobsHref={jobsHref}
        profileHref={profileHref}
      />
    </div>
  );
}

// Logo wordmark used in both header and footer — keeps the single source
// of truth for the gold-dot mark.
function Wordmark({
  size = "header",
  onDark = false,
}: {
  size?: "header" | "footer";
  onDark?: boolean;
}) {
  const text = size === "header" ? "text-[22px]" : "text-[22px]";
  return (
    <span
      className={`inline-flex items-baseline gap-px font-display font-semibold tracking-[-0.02em] ${onDark ? "text-brand-paper" : "text-brand-deep"} ${text}`}
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

function SiteHeader({ driverIdForNav }: { driverIdForNav: string | null }) {
  // Two nav postures:
  //   - Returning driver (cookie present): primary CTA = "My profile",
  //     pointing at /me — the driver dashboard with applications +
  //     stats + a link onward to /matches. We point at /me rather
  //     than /matches directly so the driver has one persistent
  //     entry point that surfaces both history and current matches.
  //   - New visitor: primary CTA = "Talk to Debbie", which scrolls
  //     to the homepage hero / chat shell.
  const primaryCta = driverIdForNav
    ? { href: "/me", label: "My profile" }
    : { href: "/#hero", label: "Talk to Debbie" };
  return (
    <header className="sticky top-0 z-50 border-b border-brand-paper/15 bg-brand-deep">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between px-5 py-[18px] sm:px-8">
        <Link
          href="/"
          aria-label="CDLA.jobs"
          className="transition-colors hover:opacity-90"
        >
          <Wordmark onDark />
        </Link>
        <nav className="flex items-center gap-4 sm:gap-8">
          <Link
            href="/#how-it-works"
            className="hidden text-sm font-medium text-brand-paper/75 transition-colors hover:text-brand-paper sm:inline"
          >
            How it works
          </Link>
          <Link
            href="/#why"
            className="hidden text-sm font-medium text-brand-paper/75 transition-colors hover:text-brand-paper sm:inline"
          >
            Why us
          </Link>
          <Link
            href="/partners"
            className="hidden text-sm font-medium text-brand-paper/75 transition-colors hover:text-brand-paper sm:inline"
          >
            For carriers
          </Link>
          <Link
            href={primaryCta.href}
            className="inline-flex items-center rounded-md bg-brand-gold px-[18px] py-2.5 text-sm font-semibold text-brand-ink transition-colors hover:bg-brand-gold-soft"
          >
            {primaryCta.label}
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
              Your CDL-A career advocate. Built for drivers.
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
