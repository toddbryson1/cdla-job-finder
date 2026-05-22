import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { drivers, zipCodes } from "@/db/schema";
import { matchDriver } from "@/lib/matching";
import { loadDisplayExtras } from "@/lib/match-display-data";
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

  if (!UUID_RE.test(driverId)) {
    return <ProfileNotFound />;
  }

  const driver = await db.query.drivers.findFirst({
    where: eq(drivers.id, driverId),
  });

  if (!driver) {
    return <ProfileNotFound />;
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
