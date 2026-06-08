import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { driverCarrierApplications, drivers, zipCodes } from "@/db/schema";
import { matchDriver } from "@/lib/matching";
import { loadDisplayExtras } from "@/lib/match-display-data";
import {
  recordExternalImpressions,
  topUpWithExternal,
} from "@/lib/external-jobs";
import { getSessionState } from "@/lib/stytch/session";
import { MatchCard } from "@/components/MatchCard";
import { getDismissedCarrierIds } from "@/lib/dismissals";
import { recordFunnelEvent } from "@/lib/funnel-events";
import { dismissCarrierAction } from "./actions";
import { ExternalJobCard } from "@/components/ExternalJobCard";
import { EmptyMatches } from "@/components/EmptyMatches";

// We aim to show every driver at least this many matches. When our
// internal carrier_jobs come up short, we top up with external
// listings (Adzuna). Keeps drivers in zero-supply regions from
// hitting a dead end.
const TARGET_MATCH_COUNT = 5;

export const metadata: Metadata = {
  title: "Your matches",
  description: "Carriers actually hiring what you said you want.",
  robots: { index: false, follow: false },
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  params: Promise<{ driverId: string }>;
}

export default async function MatchesPage({ params }: PageProps) {
  const { driverId } = await params;

  if (!UUID_RE.test(driverId)) {
    return <ProfileNotFound />;
  }

  // Two valid auth paths now:
  //
  // 1. Anonymous-intake driver: their `cdla_driver_id` cookie was set
  //    when they completed the intake. If the cookie matches the URL
  //    driverId, that's enough — they haven't claimed an email yet.
  // 2. Email-claimed driver (Stytch magic link): same as before — the
  //    session email must match drivers.email.
  //
  // A driver with no cookie AND no Stytch session gets redirected to
  // /login (existing email-keyed path).
  const cookieStore = await cookies();
  const driverCookie = cookieStore.get("cdla_driver_id")?.value;
  const hasMatchingCookie = driverCookie === driverId;

  if (!hasMatchingCookie) {
    const session = await getSessionState();
    if (session.kind !== "ok") {
      redirect(
        `/login?redirect=${encodeURIComponent(`/matches/${driverId}`)}`,
      );
    }

    const driver = await db.query.drivers.findFirst({
      where: eq(drivers.id, driverId),
    });
    if (!driver) {
      return <ProfileNotFound />;
    }
    if (!driver.email || driver.email.toLowerCase() !== session.email) {
      return <WrongDriverForSession />;
    }
  }

  const driver = await db.query.drivers.findFirst({
    where: eq(drivers.id, driverId),
  });

  if (!driver) {
    return <ProfileNotFound />;
  }

  if (!driver.homeZip) {
    return <NeedHomeLocation firstName={driver.firstName ?? ""} />;
  }

  if (driver.homeLat == null || driver.homeLng == null) {
    const zip = await db.query.zipCodes.findFirst({
      where: eq(zipCodes.zip, driver.homeZip),
    });
    if (!zip) {
      return <NeedHomeLocation firstName={driver.firstName ?? ""} />;
    }
    await db
      .update(drivers)
      .set({ homeLat: zip.lat, homeLng: zip.lng })
      .where(eq(drivers.id, driverId));
  }

  const result = await matchDriver(driverId);
  // Driver-initiated dismissals (carrier-level). Filter the engine's
  // result set so dismissed carriers' jobs don't appear on the page.
  // We keep them in driverCarrierMatches (the engine still writes
  // them) so reverse-match alerts for NEW (driver, job) pairs
  // continue to fire — dismissing today's Phoenix lane shouldn't
  // suppress next month's Atlanta one. View-layer filter only.
  const dismissedCarrierIds = await getDismissedCarrierIds(driverId);
  const visibleMatches = result.matches.filter(
    (m) => !dismissedCarrierIds.has(m.carrierId),
  );
  const extras = await loadDisplayExtras(visibleMatches.map((m) => m.jobId));

  // Top up to TARGET_MATCH_COUNT with external listings when our
  // internal matches are sparse. No-op when Adzuna isn't configured
  // or when internal already meets the target.
  const externalMatches =
    driver.homeLat != null && driver.homeLng != null
      ? await topUpWithExternal({
          driver: {
            id: driver.id,
            homeLat: Number(driver.homeLat),
            homeLng: Number(driver.homeLng),
            desiredEquipment: driver.desiredEquipment,
            minWeeklyPay: driver.minWeeklyPay,
            willingToRelocate: driver.willingToRelocate,
          },
          targetCount: TARGET_MATCH_COUNT,
          internalCount: visibleMatches.length,
        })
      : [];

  // Best-effort impression tracking for the externals we render.
  if (externalMatches.length > 0) {
    void recordExternalImpressions(driverId, externalMatches);
  }

  // Best-effort funnel event: this driver landed on /matches and saw
  // this many cards at this moment. Runs via after() so the INSERT is
  // guaranteed to execute even on a serverless runtime that freezes the
  // function once the response flushes — a bare `void` here can drop the
  // write post-response. matchCount is the TOTAL the driver actually
  // sees (internal + external top-ups); the split is in metadata for
  // drop-off analysis by supply source.
  after(() =>
    recordFunnelEvent({
      eventType: "matches_viewed",
      driverId,
      matchCount: visibleMatches.length + externalMatches.length,
      metadata: {
        internal: visibleMatches.length,
        external: externalMatches.length,
        truncated: result.truncated,
      },
    }),
  );

  // Look up which (driver, job) pairs the driver has already pursued
  // (consented through the Stage 2 flow). Used to badge the carrier card
  // so the driver can tell what they've already engaged with.
  const applications = await db.query.driverCarrierApplications.findMany({
    where: eq(driverCarrierApplications.driverId, driverId),
    columns: {
      jobId: true,
      consentedAt: true,
      lastQualified: true,
    },
  });
  const pursued = new Map<
    string,
    { consentedAt: Date; lastQualified: boolean | null }
  >();
  for (const a of applications) {
    pursued.set(a.jobId, {
      consentedAt: a.consentedAt,
      lastQualified: a.lastQualified,
    });
  }

  // Bind the dismiss action to this driverId once so each MatchCard
  // gets a per-carrier callback without re-deriving in the render.
  const dismissForThisDriver = async (carrierId: string) => {
    "use server";
    await dismissCarrierAction(driverId, carrierId);
  };

  return (
    <Shell>
      <Header
        firstName={driver.firstName ?? ""}
        matchCount={visibleMatches.length}
        externalCount={externalMatches.length}
        truncated={result.truncated}
      />
      <DebbieFollowupBanner />
      {visibleMatches.length === 0 && externalMatches.length === 0 ? (
        <EmptyMatches firstName={driver.firstName ?? ""} />
      ) : (
        <>
          {visibleMatches.length > 0 ? (
            <ul className="mt-8 flex flex-col gap-4">
              {visibleMatches.map((m, i) => (
                <li key={m.jobId}>
                  <MatchCard
                    driverId={driverId}
                    match={m}
                    extras={extras.get(m.jobId)}
                    pursuit={pursued.get(m.jobId) ?? null}
                    onDismissCarrier={dismissForThisDriver}
                    // Default-expand the first 3 cards so the driver
                    // can scan requirements + description without
                    // clicking each one open. Target is 2-3 apps per
                    // session — the more friction we strip off the
                    // top of the list, the better the conversion.
                    initiallyExpanded={i < 3}
                  />
                </li>
              ))}
            </ul>
          ) : null}

          {externalMatches.length > 0 ? (
            <section className="mt-10">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-muted">
                Other CDL jobs near you
              </h2>
              <p className="mt-2 text-sm leading-6 text-brand-muted">
                These are public listings we found on the open web. We
                don&rsquo;t work with these carriers, so you&rsquo;d apply
                directly with them — your CDLA.jobs profile isn&rsquo;t
                shared.
              </p>
              <ul className="mt-4 flex flex-col gap-4">
                {externalMatches.map((m) => (
                  <li key={m.externalJobId}>
                    <ExternalJobCard match={m} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
      <FooterNote />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-brand-surface">
      <div className="mx-auto max-w-3xl px-5 py-10 sm:py-14">{children}</div>
    </main>
  );
}

/**
 * Small "continue the conversation" banner under the matches header.
 * Bridges the gap between "Debbie's done with intake" and "you're now
 * looking at matches alone" — drivers who walked in via the chat may
 * still have follow-up questions about specific jobs. Each match
 * already has a per-card "Ask Debbie" button (which scopes the
 * conversation to that job); this banner is the general entry point.
 *
 * Links to the home hero's anchor (#hero) where the chat lives. For
 * a driver who's already in the system that's fine — the
 * homepage's WelcomeBackCard takes over the hero slot, and they can
 * still tap into ad-hoc chat via the per-card "Ask Debbie" buttons.
 */
function DebbieFollowupBanner() {
  return (
    <div className="mt-4 rounded-xl border border-brand-rule bg-brand-paper px-4 py-3 text-sm leading-6 text-brand-ink shadow-sm sm:flex sm:items-center sm:justify-between sm:gap-4">
      <p>
        <span
          aria-hidden="true"
          className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-deep text-[11px] font-semibold text-brand-paper"
        >
          D
        </span>
        Got questions about any of these? Tap{" "}
        <span className="font-semibold">Ask Debbie</span> on any match
        card.
      </p>
    </div>
  );
}

function Header({
  firstName,
  matchCount,
  externalCount,
  truncated,
}: {
  firstName: string;
  matchCount: number;
  externalCount: number;
  truncated: boolean;
}) {
  let intro: string;
  if (matchCount === 0 && externalCount === 0) {
    intro =
      "We ran your profile against every carrier we work with. Here is what came back.";
  } else if (matchCount === 0 && externalCount > 0) {
    intro = `None of the carriers we work with are hiring exactly what you said you want right now. We pulled ${externalCount} open listing${externalCount === 1 ? "" : "s"} from public job boards below — you would apply directly with those carriers.`;
  } else if (truncated) {
    intro = `${matchCount}+ carriers came back. We are showing the strongest fits first.`;
  } else if (externalCount > 0) {
    intro = `${matchCount} ${matchCount === 1 ? "carrier" : "carriers"} came back. You pick which ones see your info. We also pulled ${externalCount} open listing${externalCount === 1 ? "" : "s"} from public job boards below.`;
  } else {
    intro = `${matchCount} ${matchCount === 1 ? "carrier" : "carriers"} came back. You pick which ones see your info.`;
  }
  return (
    <header className="mb-2">
      <p className="text-sm font-medium text-brand-medium">CDLA.jobs</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-brand-ink">
        {firstName ? `${firstName}, your matches` : "Your matches"}
      </h1>
      <p className="mt-3 text-base leading-7 text-brand-muted">{intro}</p>
    </header>
  );
}

function FooterNote() {
  return (
    <p className="mt-10 text-xs leading-5 text-brand-muted">
      Sponsored Match, Referral Partner, and Public Job Posting labels tell you
      how we know about each carrier. Hover any badge for what it means. Nothing
      gets shared with a carrier until you continue on a specific job.
    </p>
  );
}

function ProfileNotFound() {
  return (
    <Shell>
      <header className="mb-2">
        <p className="text-sm font-medium text-brand-medium">CDLA.jobs</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-brand-ink">
          We could not find that profile.
        </h1>
        <p className="mt-3 text-base leading-7 text-brand-ink">
          The link you used does not match any driver in our system. If you just
          finished your intake, the link in your email is the one that works.
        </p>
      </header>
      <div className="mt-6">
        <Link
          href="/intake"
          className="inline-flex h-11 items-center justify-center rounded-md border border-brand-rule bg-brand-paper px-5 text-sm font-medium text-brand-ink hover:bg-brand-surface"
        >
          Start a new intake
        </Link>
      </div>
    </Shell>
  );
}

function WrongDriverForSession() {
  return (
    <Shell>
      <header className="mb-2">
        <p className="text-sm font-medium text-brand-medium">CDLA.jobs</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-brand-ink">
          That is not your profile.
        </h1>
        <p className="mt-3 text-base leading-7 text-brand-ink">
          You are signed in, but the link points to someone else&rsquo;s matches.
          If you are trying to see your own, sign in with the email you used
          when you filled out your intake.
        </p>
      </header>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/login"
          className="inline-flex h-11 items-center justify-center rounded-md bg-brand-deep px-5 text-sm font-semibold text-brand-paper hover:bg-brand-medium"
        >
          Sign in with the right email
        </Link>
      </div>
    </Shell>
  );
}

function NeedHomeLocation({ firstName }: { firstName: string }) {
  return (
    <Shell>
      <header className="mb-2">
        <p className="text-sm font-medium text-brand-medium">CDLA.jobs</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-brand-ink">
          {firstName ? `${firstName}, ` : ""}we need your home zip.
        </h1>
        <p className="mt-3 text-base leading-7 text-brand-ink">
          We match jobs by how far the domicile is from where you live, so we
          cannot show matches without a 5-digit US home zip on your profile.
        </p>
      </header>
      <div className="mt-6">
        <Link
          href="/intake"
          className="inline-flex h-11 items-center justify-center rounded-md border border-brand-rule bg-brand-paper px-5 text-sm font-medium text-brand-ink hover:bg-brand-surface"
        >
          Update your intake
        </Link>
      </div>
    </Shell>
  );
}
