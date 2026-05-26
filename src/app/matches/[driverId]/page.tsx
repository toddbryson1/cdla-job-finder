import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { driverCarrierApplications, drivers, zipCodes } from "@/db/schema";
import { matchDriver } from "@/lib/matching";
import { loadDisplayExtras } from "@/lib/match-display-data";
import { getSessionState } from "@/lib/stytch/session";
import { MatchCard } from "@/components/MatchCard";
import { EmptyMatches } from "@/components/EmptyMatches";

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

  // Server-side session verification. The proxy already does an optimistic
  // cookie-presence check; this is the real Stytch validation. If the cookie
  // is missing or invalid, send back to /login.
  const session = await getSessionState();
  if (session.kind !== "ok") {
    redirect(`/login?redirect=${encodeURIComponent(`/matches/${driverId}`)}`);
  }

  if (!UUID_RE.test(driverId)) {
    return <ProfileNotFound />;
  }

  const driver = await db.query.drivers.findFirst({
    where: eq(drivers.id, driverId),
  });

  if (!driver) {
    return <ProfileNotFound />;
  }

  // Driver identity check (attorney addendum Q10): a magic-link session can
  // only view matches for the email it authenticated as. A leaked or guessed
  // driver UUID is useless without the matching email.
  if (driver.email.toLowerCase() !== session.email) {
    return <WrongDriverForSession />;
  }

  if (!driver.homeZip) {
    return <NeedHomeLocation firstName={driver.firstName} />;
  }

  if (driver.homeLat == null || driver.homeLng == null) {
    const zip = await db.query.zipCodes.findFirst({
      where: eq(zipCodes.zip, driver.homeZip),
    });
    if (!zip) {
      return <NeedHomeLocation firstName={driver.firstName} />;
    }
    await db
      .update(drivers)
      .set({ homeLat: zip.lat, homeLng: zip.lng })
      .where(eq(drivers.id, driverId));
  }

  const result = await matchDriver(driverId);
  const extras = await loadDisplayExtras(result.matches.map((m) => m.jobId));

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

  return (
    <Shell>
      <Header
        firstName={driver.firstName}
        matchCount={result.matches.length}
        truncated={result.truncated}
      />
      {result.matches.length === 0 ? (
        <EmptyMatches firstName={driver.firstName} />
      ) : (
        <ul className="mt-8 flex flex-col gap-4">
          {result.matches.map((m) => (
            <li key={m.jobId}>
              <MatchCard
                driverId={driverId}
                match={m}
                extras={extras.get(m.jobId)}
                pursuit={pursued.get(m.jobId) ?? null}
              />
            </li>
          ))}
        </ul>
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

function Header({
  firstName,
  matchCount,
  truncated,
}: {
  firstName: string;
  matchCount: number;
  truncated: boolean;
}) {
  const intro =
    matchCount === 0
      ? "We ran your profile against every carrier we work with. Here is what came back."
      : truncated
        ? `${matchCount}+ carriers came back. We are showing the strongest fits first.`
        : `${matchCount} ${matchCount === 1 ? "carrier" : "carriers"} came back. You pick which ones see your info.`;
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
          className="inline-flex h-11 items-center justify-center rounded-md border border-brand-rule bg-white px-5 text-sm font-medium text-brand-ink hover:bg-brand-surface"
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
          className="inline-flex h-11 items-center justify-center rounded-md bg-brand-deep px-5 text-sm font-semibold text-white hover:bg-brand-medium"
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
          className="inline-flex h-11 items-center justify-center rounded-md border border-brand-rule bg-white px-5 text-sm font-medium text-brand-ink hover:bg-brand-surface"
        >
          Update your intake
        </Link>
      </div>
    </Shell>
  );
}
