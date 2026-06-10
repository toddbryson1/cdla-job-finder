import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { SiteShell } from "@/components/SiteShell";
import { DebbieIntakeChat } from "@/components/DebbieIntakeChat";
import { db } from "@/db/client";
import { drivers } from "@/db/schema";

// Copy is locked verbatim per SPEC_homepage-copy-v1.md and the design
// reference at cdlajobs-homepage-design.html. Do NOT paraphrase
// headlines or microcopy — they're attorney-reviewed and brand-locked.
// Sections render top-to-bottom: hero → how it works → why different
// → for carriers → footer (in shell).
//
// The hero's chat surface is now live: DebbieIntakeChat drives the
// Stage 1 conversation against /api/debbie/intake, captures the five
// fields, gates on Stage 1 consent, and POSTs to /api/intake to land
// the driver on /matches. Voice + resume + Stage 2 are not yet built
// — see SPEC_conversational-ai-intake-v1.md §§6, 7, 5 respectively.
//
// Visual evolution per the design ref:
//   - Warm paper palette (--brand-paper / --brand-surface), fading
//     gold "matchline" between sections, concentric circles in hero
//   - Fraunces italic accents on key phrases ("five minutes",
//     "No applying to 40 places", "And we don't sell your number")
//   - Numbered step circles with the first one gold-ringed

export const metadata: Metadata = {
  title: "CDLA.jobs — Class A driver matching. Built for drivers.",
  description:
    "Find your next CDL-A driving job in five minutes. Talk to Debbie, our AI job matcher. Real carriers, no recruiter spam. Free for drivers.",
  alternates: { canonical: "https://www.cdla.jobs/" },
  openGraph: {
    title: "CDLA.jobs — Class A driver matching. Built for drivers.",
    description:
      "Find your next CDL-A driving job in five minutes. Talk to Debbie, our AI job matcher. Real carriers, no recruiter spam. Free for drivers.",
    url: "https://www.cdla.jobs/",
    siteName: "CDLA.jobs",
    type: "website",
  },
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Returning-driver lookup: anonymous intake sets cdla_driver_id, so a
 * driver who finished intake and then revisits / will have the cookie.
 * Without this check the homepage was inviting them to start a fresh
 * intake every time — actual conversion killer for repeat visits.
 *
 * We return both the driver id and the first name (when present) so
 * the welcome-back card can greet them. firstName is null for
 * anonymous-intake drivers who haven't claimed identity yet.
 */
async function getReturningDriver(): Promise<{
  id: string;
  firstName: string | null;
} | null> {
  const cookieStore = await cookies();
  const id = cookieStore.get("cdla_driver_id")?.value;
  if (!id || !UUID_RE.test(id)) return null;
  try {
    const row = await db.query.drivers.findFirst({
      where: eq(drivers.id, id),
      columns: { id: true, firstName: true },
    });
    if (!row) return null;
    return { id: row.id, firstName: row.firstName };
  } catch {
    // DB hiccup — render the homepage as if anonymous. Better to
    // show the chat (which fails closed if needed) than to error
    // the whole page.
    return null;
  }
}

export default async function HomePage() {
  const returning = await getReturningDriver();
  return (
    <SiteShell>
      <Hero returning={returning} />
      <HowItWorks />
      <WhyDifferent />
      <ForCarriers />
    </SiteShell>
  );
}

function Hero({
  returning,
}: {
  returning: { id: string; firstName: string | null } | null;
}) {
  return (
    <section className="relative overflow-hidden bg-brand-paper" id="hero">
      <div className="relative mx-auto grid max-w-6xl gap-12 px-5 pb-16 pt-14 sm:gap-16 sm:pb-24 sm:pt-20 lg:grid-cols-[1fr_1.05fr] lg:items-center">
        {/* Concentric outline circles on the right side — quiet
            geometric mark, brand-spare per the design ref. Hidden on
            mobile because they crowd the chat shell. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-[-120px] top-10 hidden h-[320px] w-[320px] rounded-full border border-brand-rule opacity-60 lg:block"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-[-40px] top-[200px] hidden h-[160px] w-[160px] rounded-full border border-brand-gold opacity-25 lg:block"
        />

        <div className="relative">
          <p className="mb-5 inline-flex items-center gap-2.5 text-[13px] font-semibold uppercase tracking-[0.12em] text-brand-medium">
            <span
              aria-hidden="true"
              className="inline-block h-px w-6 bg-brand-gold"
            />
            Class A driver matching
          </p>
          {returning ? (
            <>
              {/* Returning-driver copy — keep the page rhythm but
                  reframe the headline around "your matches" instead
                  of "find your next job." Avoids fighting the
                  WelcomeBackCard's message on the right. */}
              <h1 className="text-4xl font-bold leading-[1.04] tracking-[-0.03em] text-brand-ink sm:text-5xl lg:text-6xl">
                Your matches are{" "}
                <span className="font-display font-medium italic text-brand-deep">
                  right here.
                </span>
              </h1>
              <p className="mt-6 text-lg leading-[1.5] text-brand-ink sm:text-xl">
                We kept your spot. Pick up where you left off — or check
                what&rsquo;s new since your last visit.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-4xl font-bold leading-[1.04] tracking-[-0.03em] text-brand-ink sm:text-5xl lg:text-6xl">
                Find your next driving job in{" "}
                <span className="font-display font-medium italic text-brand-deep">
                  five minutes.
                </span>
              </h1>
              <p className="mt-6 text-lg leading-[1.5] text-brand-ink sm:text-xl">
                Talk to{" "}
                <span className="font-semibold text-brand-deep">Debbie</span>.
                Tell her what you want.
              </p>
            </>
          )}
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-brand-muted">
            <TrustItem>Free for drivers</TrustItem>
            <TrustItem>We don&rsquo;t sell your data</TrustItem>
            <TrustItem>Real carriers, hiring now</TrustItem>
          </ul>
          {!returning ? (
            <p className="mt-6 text-sm text-brand-muted">
              Already signed up?{" "}
              <Link
                href="/login?redirect=/me"
                className="font-medium text-brand-deep underline-offset-2 hover:underline"
              >
                Log in to your matches
              </Link>
            </p>
          ) : null}
        </div>

        {returning ? (
          <WelcomeBackCard
            driverId={returning.id}
            firstName={returning.firstName}
          />
        ) : (
          <DebbieIntakeChat
            audioEnabled={debbieAudioEnabled()}
            resumeEnabled={debbieResumeEnabled()}
          />
        )}
      </div>
    </section>
  );
}

/**
 * Card that replaces the Debbie chat shell in the hero for drivers
 * who already have a session cookie. Primary CTA goes straight to
 * their matches; secondary affordance lets them start fresh if for
 * some reason they want to (different driver on the same device,
 * decided to redo intake, etc.).
 *
 * Intentionally similar visual weight to the chat shell it replaces
 * so the page rhythm stays consistent — same rounded card on
 * brand-paper, same rough vertical footprint.
 */
function WelcomeBackCard({
  driverId,
  firstName,
}: {
  driverId: string;
  firstName: string | null;
}) {
  const greeting = firstName ? `Welcome back, ${firstName}.` : "Welcome back.";
  return (
    <div className="rounded-2xl border border-brand-rule bg-brand-paper p-6 shadow-sm sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-medium">
        Picking up where you left off
      </p>
      <h2 className="mt-3 text-2xl font-bold tracking-tight text-brand-ink sm:text-3xl">
        {greeting}
      </h2>
      <p className="mt-3 text-base leading-7 text-brand-ink">
        Your matches are saved. You can jump straight back to them — no need
        to redo your intake.
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link
          href={`/matches/${driverId}`}
          className="inline-flex h-12 items-center justify-center rounded-md bg-brand-deep px-6 text-sm font-semibold text-brand-paper shadow-sm transition-colors hover:bg-brand-medium"
        >
          See my matches
        </Link>
        {/* "Start fresh" → POST to a server action that clears the
            cookie + revalidates. The form is styled to look like a
            link to keep the visual hierarchy (matches CTA primary). */}
        <form action={resetIntakeSession}>
          <button
            type="submit"
            className="text-sm font-medium text-brand-muted underline-offset-2 hover:text-brand-ink hover:underline"
          >
            Or start a fresh intake
          </button>
        </form>
      </div>
    </div>
  );
}

/**
 * Server action — clears the cdla_driver_id cookie and revalidates
 * the homepage. After this fires the driver lands back on / with no
 * cookie and sees the Debbie chat shell again, ready for a fresh
 * intake. Used by the "Or start a fresh intake" button on the
 * returning-driver welcome card.
 *
 * Doesn't delete the underlying driver row — the user can still
 * sign in at /login and find their previous matches if they change
 * their mind. We only let go of the cookie.
 */
async function resetIntakeSession() {
  "use server";
  const { revalidatePath } = await import("next/cache");
  const cookieStore = await cookies();
  cookieStore.delete("cdla_driver_id");
  revalidatePath("/");
}

// Server-side feature-flag reads for the mic + paperclip buttons.
// Each mirrors its lib's is{Audio,Resume}Enabled() — kept here as
// separate reads so the client component never imports anything
// from the server-only lib modules (which have Node-only deps like
// Buffer and would bloat the client bundle).
//
// We DON'T require the API keys here because those env vars are
// only readable server-side; the page render only needs to know
// whether the UI should appear. If the key is missing the route
// itself 503s with a graceful error, so a flag-on key-off setup
// fails closed rather than open.
function debbieAudioEnabled(): boolean {
  return process.env.DEBBIE_AUDIO_ENABLED === "true";
}

function debbieResumeEnabled(): boolean {
  return process.env.DEBBIE_RESUME_ENABLED === "true";
}

function TrustItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-gold"
      />
      {children}
    </li>
  );
}

function HowItWorks() {
  const steps: Array<{ n: string; title: string; body: string }> = [
    {
      n: "1",
      title: "Tell Debbie what you want.",
      body: "Five minutes. Talk, type, or upload your resume.",
    },
    {
      n: "2",
      title: "See your matches.",
      body: "Carriers hiring drivers like you, ranked by fit. No applying to 40 places.",
    },
    {
      n: "3",
      title: "Pick the carriers you want.",
      body: "They contact you. You decide who gets your info. Nobody gets sold your number.",
    },
  ];
  return (
    <section
      id="how-it-works"
      className="relative border-t border-brand-rule bg-brand-paper"
    >
      <div className="relative mx-auto max-w-6xl px-5 py-16 sm:py-24">
        <p className="mb-4 inline-flex items-center gap-2.5 text-[13px] font-semibold uppercase tracking-[0.12em] text-brand-medium">
          <span
            aria-hidden="true"
            className="inline-block h-px w-6 bg-brand-gold"
          />
          How it works
        </p>
        <h2 className="max-w-3xl text-3xl font-bold leading-[1.1] tracking-[-0.025em] text-brand-ink sm:text-4xl lg:text-[44px]">
          Three steps.{" "}
          <span className="font-display font-medium italic text-brand-deep">
            No applying to 40 places.
          </span>
        </h2>

        <div className="relative mt-16 grid gap-12 sm:grid-cols-3 sm:gap-6">
          {/* The matchline that runs across the step numbers — purely
              decorative, brand-mark of "matching" connecting the three
              steps visually. Suppressed on mobile (stacked layout). */}
          <div
            aria-hidden="true"
            className="matchline left-[60px] right-[60px] top-8 hidden sm:block"
            style={{ opacity: 0.35 }}
          />
          {steps.map((s, i) => (
            <div key={s.n} className="relative z-10">
              <div
                className={`mb-6 flex h-16 w-16 items-center justify-center rounded-full border bg-brand-paper font-display text-[26px] font-semibold shadow-[0_1px_2px_rgba(14,30,51,0.04),_0_1px_3px_rgba(14,30,51,0.06)] ${
                  i === 0
                    ? "border-brand-gold text-brand-gold"
                    : "border-brand-rule text-brand-deep"
                }`}
              >
                {s.n}
              </div>
              <h3 className="text-lg font-bold tracking-[-0.01em] text-brand-ink">
                {s.title}
              </h3>
              <p className="mt-2.5 text-[15.5px] leading-[1.6] text-brand-muted">
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function WhyDifferent() {
  const claims: Array<{ title: string; body: string }> = [
    {
      title: "Free for drivers.",
      body: "You don't pay us anything. Carriers do — but only the ones that want priority access. Drivers always pay zero.",
    },
    {
      title: "We don't sell your data.",
      body: "Your information goes to carriers you pick. Not to a panel of buyers. Not to “marketing partners.” Not to anyone you didn't choose.",
    },
    {
      title: "Match in five minutes.",
      body: "Debbie asks a handful of questions and shows you carriers actually hiring drivers like you. No 20-page applications until you're ready to apply to a specific carrier.",
    },
    {
      title: "Real carriers, not a lead farm.",
      body: "Every carrier in our system is hiring. If they're not, they're not in our system. We don't pad the results.",
    },
  ];
  return (
    <section
      id="why"
      className="border-y border-brand-rule bg-brand-surface"
    >
      <div className="mx-auto max-w-6xl px-5 py-16 sm:py-24">
        <p className="mb-4 inline-flex items-center gap-2.5 text-[13px] font-semibold uppercase tracking-[0.12em] text-brand-medium">
          <span
            aria-hidden="true"
            className="inline-block h-px w-6 bg-brand-gold"
          />
          Why CDLA.jobs is different
        </p>
        <h2 className="max-w-3xl text-3xl font-bold leading-[1.1] tracking-[-0.025em] text-brand-ink sm:text-4xl lg:text-[44px]">
          We don&rsquo;t pad the results.{" "}
          <span className="font-display font-medium italic text-brand-deep">
            And we don&rsquo;t sell your number.
          </span>
        </h2>

        <div className="mt-16 grid gap-px overflow-hidden rounded-xl border border-brand-rule bg-brand-rule sm:grid-cols-2">
          {claims.map((c) => (
            <div
              key={c.title}
              className="bg-brand-paper p-8 transition-colors hover:bg-[#FDFCF8]"
            >
              <h3 className="flex items-baseline gap-2.5 text-xl font-bold tracking-[-0.015em] text-brand-ink">
                <span
                  aria-hidden="true"
                  className="inline-block h-2 w-2 flex-shrink-0 -translate-y-0.5 bg-brand-gold"
                />
                {c.title}
              </h3>
              <p className="mt-3 text-[15.5px] leading-[1.6] text-brand-muted">
                {c.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ForCarriers() {
  return (
    <section id="carriers" className="bg-brand-deep text-brand-paper">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:py-20 lg:grid-cols-[1fr_auto] lg:items-center lg:gap-12">
        <div>
          <h2 className="text-2xl font-bold tracking-[-0.02em] text-brand-paper sm:text-[26px]">
            Hiring CDL-A drivers?
          </h2>
          <p className="mt-3 max-w-2xl text-[15.5px] leading-[1.6] text-brand-paper/[0.78]">
            We send matched driver prequalifications to your ATS. Drivers
            choose to share their info with you &mdash; not a lead panel.
            Free at Tier 2; $2,500/month for 24-hour exclusivity. No per-hire
            fees, no setup fees.
          </p>
        </div>
        <div className="flex flex-shrink-0 flex-wrap gap-3">
          <Link
            href="/partners/integration"
            className="inline-flex h-11 items-center justify-center rounded-md border border-brand-paper/30 px-6 text-sm font-semibold text-brand-paper transition-colors hover:border-brand-gold hover:bg-brand-paper/[0.08]"
          >
            Integration
          </Link>
          <Link
            href="/partners/exclusivity"
            className="inline-flex h-11 items-center justify-center rounded-md bg-brand-gold px-6 text-sm font-semibold text-brand-ink transition-colors hover:bg-brand-gold-soft"
          >
            Exclusivity
          </Link>
        </div>
      </div>
    </section>
  );
}
