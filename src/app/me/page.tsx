// /me — driver dashboard. The "home page" for any driver who has
// finished intake. Surfaces a profile snapshot, application history
// with status badges, and the next-action CTAs (see matches, talk to
// Debbie, update info).
//
// Auth mirrors /matches and /apply: cookie-bearing anonymous drivers
// AND Stytch-signed-in email drivers both qualify. Anyone else is
// redirected to /login.
//
// This is the route that fills the gap for "driver clears cookies on
// a different device" — they sign in once via /login + magic link,
// then land here with a real home base.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { drivers } from "@/db/schema";
import { getSessionState } from "@/lib/stytch/session";
import {
  getDriverApplicationHistory,
  summarizeApplications,
  type DriverApplicationRow,
} from "@/lib/me/dashboard-queries";

export const metadata: Metadata = {
  title: "Your CDLA.jobs",
  robots: { index: false, follow: false },
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function MePage() {
  // Auth — same two-path pattern as /matches and /apply.
  const cookieStore = await cookies();
  const cookieDriverId = cookieStore.get("cdla_driver_id")?.value;

  let driverId: string | null = null;
  if (cookieDriverId && UUID_RE.test(cookieDriverId)) {
    // Cookie path. Verify the row exists; stale cookie → fall through
    // to the session check.
    const row = await db.query.drivers.findFirst({
      where: eq(drivers.id, cookieDriverId),
      columns: { id: true },
    });
    if (row) driverId = row.id;
  }

  if (!driverId) {
    const session = await getSessionState();
    if (session.kind !== "ok") {
      redirect("/login?redirect=/me");
    }
    const row = await db.query.drivers.findFirst({
      where: eq(drivers.email, session.email),
      columns: { id: true },
    });
    if (!row) {
      // Stytch-authenticated but no driver row — they signed in
      // with an email that's never done intake. Send them through.
      redirect("/intake");
    }
    driverId = row.id;
  }

  const driver = await db.query.drivers.findFirst({
    where: eq(drivers.id, driverId),
  });
  if (!driver) {
    // Shouldn't happen — we just validated the row above. Defensive.
    redirect("/login");
  }

  const applications = await getDriverApplicationHistory(driverId);
  const stats = summarizeApplications(applications);

  const intakeAge = ageInWords(driver.createdAt);

  return (
    <main className="min-h-screen bg-brand-surface">
      <div className="mx-auto max-w-4xl px-5 py-10 sm:py-14">
        <Header
          firstName={driver.firstName ?? null}
          intakeAge={intakeAge}
        />

        <AlertsStrip
          stats={stats}
          applications={applications}
          intakeAge={intakeAge}
          driverId={driverId}
        />

        <StatsRow stats={stats} />

        <section className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-muted">
            Application history
          </h2>
          {applications.length === 0 ? (
            <div className="mt-3 rounded-xl border border-brand-rule bg-brand-paper p-5 text-sm leading-6 text-brand-ink">
              You haven&rsquo;t applied to any carriers yet.{" "}
              <Link
                href={`/matches/${driverId}`}
                className="font-semibold text-brand-medium underline-offset-2 hover:underline"
              >
                Pick a match
              </Link>{" "}
              to get started — most drivers fire off 2–3 applications in the
              same session.
            </div>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {applications.map((a) => (
                <li key={a.applicationId}>
                  <ApplicationCard app={a} driverId={driverId!} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-12 grid gap-3 sm:grid-cols-2">
          <ActionCard
            href={`/matches/${driverId}`}
            primary
            title="See all matches"
            body="Your match list updates as carriers post new positions."
          />
          <ActionCard
            href="/#hero"
            title="Talk to Debbie again"
            body="Update your preferences, ask about a specific carrier."
          />
        </section>

        <p className="mt-12 text-xs leading-5 text-brand-muted">
          Profile: {driver.firstName ?? "—"} {driver.lastName ?? ""} ·{" "}
          {driver.email ?? "no email yet"} ·{" "}
          {driver.homeZip ?? "no home zip"}. To update intake answers, talk
          to Debbie again — she&rsquo;ll write the changes back.
        </p>
      </div>
    </main>
  );
}

function Header({
  firstName,
  intakeAge,
}: {
  firstName: string | null;
  intakeAge: string | null;
}) {
  return (
    <header className="mb-8">
      <p className="text-sm font-medium text-brand-medium">CDLA.jobs</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-brand-ink sm:text-4xl">
        {firstName ? `Welcome back, ${firstName}.` : "Welcome back."}
      </h1>
      {intakeAge ? (
        <p className="mt-2 text-sm text-brand-muted">
          You joined {intakeAge}. Your profile + answers are saved.
        </p>
      ) : null}
    </header>
  );
}

/**
 * Notification-shaped strip rendering up to a handful of "things you
 * should know" — recent Sterling confirmations, "you haven't applied
 * yet," activity nudges. Renders nothing when there's nothing to say.
 *
 * Each alert is intentionally specific. Generic "you have N items"
 * dashboards train drivers to ignore the strip; calling out concrete
 * carrier-by-carrier events keeps it scannable.
 */
function AlertsStrip({
  stats,
  applications,
  intakeAge,
  driverId,
}: {
  stats: ReturnType<typeof summarizeApplications>;
  applications: DriverApplicationRow[];
  intakeAge: string | null;
  driverId: string;
}) {
  const alerts: React.ReactNode[] = [];

  // Sterling confirmations — most recent first, cap at 3 so the strip
  // doesn't dominate the page.
  const confirmed = applications
    .filter((a) => a.sterlingConfirmedAt)
    .sort(
      (a, b) =>
        (b.sterlingConfirmedAt?.getTime() ?? 0) -
        (a.sterlingConfirmedAt?.getTime() ?? 0),
    )
    .slice(0, 3);
  for (const a of confirmed) {
    alerts.push(
      <li
        key={`sterling-${a.applicationId}`}
        className="rounded-md border border-brand-medium/30 bg-brand-medium/5 px-4 py-2.5 text-sm leading-6 text-brand-ink"
      >
        <span className="font-semibold">Sterling has your application</span>{" "}
        for {a.carrierName} — submitted{" "}
        {ageInWords(a.sterlingConfirmedAt!)}. Recruiter follow-up next.
      </li>,
    );
  }

  // "Failed validation" alerts — driver should know if a partner
  // pipeline kicked their app back.
  const failed = applications.filter(
    (a) => a.partnerStage === "submit_failed_validation",
  );
  for (const a of failed) {
    alerts.push(
      <li
        key={`failed-${a.applicationId}`}
        className="rounded-md border border-brand-gold/40 bg-brand-gold/10 px-4 py-2.5 text-sm leading-6 text-brand-ink"
      >
        <span className="font-semibold">{a.carrierName}</span> needs another
        look at your application. We&rsquo;ll be in touch — no action needed
        from you yet.
      </li>,
    );
  }

  // No-applications nudge — drives the next step explicitly.
  if (
    stats.applicationsTotal === 0 &&
    intakeAge &&
    intakeAge !== "just now"
  ) {
    alerts.push(
      <li
        key="no-apps"
        className="rounded-md border border-brand-rule bg-brand-paper px-4 py-2.5 text-sm leading-6 text-brand-ink"
      >
        Your intake is saved but you haven&rsquo;t picked a carrier yet.{" "}
        <Link
          href={`/matches/${driverId}`}
          className="font-semibold text-brand-medium underline-offset-2 hover:underline"
        >
          Open your matches →
        </Link>
      </li>,
    );
  }

  if (alerts.length === 0) return null;

  return (
    <section className="mb-8">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-muted">
        Updates
      </p>
      <ul className="flex flex-col gap-2">{alerts}</ul>
    </section>
  );
}

function StatsRow({
  stats,
}: {
  stats: ReturnType<typeof summarizeApplications>;
}) {
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard label="Applications" value={stats.applicationsTotal} />
      <StatCard
        label="Qualified"
        value={stats.qualifiedCount}
        sub={
          stats.applicationsTotal > 0
            ? `${Math.round(
                (stats.qualifiedCount / stats.applicationsTotal) * 100,
              )}% qualified`
            : undefined
        }
      />
      <StatCard
        label="Not a match"
        value={stats.notQualifiedCount}
        sub="other carriers fit you"
      />
      <StatCard
        label="Sterling confirmed"
        value={stats.sterlingConfirmedCount}
        sub="recruiter follow-up next"
      />
    </section>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: number;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-brand-rule bg-brand-paper p-4">
      <div className="text-xs uppercase tracking-wide text-brand-muted">
        {label}
      </div>
      <div className="mt-1 text-3xl font-semibold text-brand-ink">{value}</div>
      {sub ? (
        <div className="mt-0.5 text-xs text-brand-muted">{sub}</div>
      ) : null}
    </div>
  );
}

function ApplicationCard({
  app,
  driverId,
}: {
  app: DriverApplicationRow;
  driverId: string;
}) {
  const statusBadge = renderStatusBadge(app);
  const dateLine = app.consentedAt.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return (
    <article className="rounded-xl border border-brand-rule bg-brand-paper p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-brand-muted">{dateLine}</p>
          <h3 className="mt-1 text-base font-semibold text-brand-ink sm:text-lg">
            {app.carrierName}
          </h3>
          <p className="mt-0.5 text-sm text-brand-muted">
            {app.positionTitle} · {app.domicileCity}, {app.domicileState}
          </p>
        </div>
        {statusBadge}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Link
          href={`/match/${driverId}/${app.jobId}/apply?step=result`}
          className="inline-flex h-9 items-center justify-center rounded-md border border-brand-rule bg-brand-paper px-4 text-xs font-medium text-brand-ink hover:bg-brand-surface"
        >
          {app.lastQualified === false ? "See why" : "Open this application"}
        </Link>
        {app.sterlingRecordId ? (
          <span className="text-xs text-brand-muted">
            Sterling ref:{" "}
            <code className="font-mono">{app.sterlingRecordId}</code>
          </span>
        ) : null}
      </div>
    </article>
  );
}

/** Drives the colored pill on each application card. Encodes the
 *  partner-stage states and the qualifies/doesn't path. */
function renderStatusBadge(app: DriverApplicationRow): React.ReactNode {
  // Sterling-confirmed wins all other states — it's the strongest
  // positive signal.
  if (app.sterlingConfirmedAt) {
    return (
      <span className="inline-flex items-center rounded-full bg-brand-medium/15 px-2.5 py-0.5 text-xs font-semibold text-brand-medium">
        Sterling confirmed
      </span>
    );
  }
  if (app.partnerStage === "submit_failed_validation") {
    return (
      <span className="inline-flex items-center rounded-full bg-brand-gold/15 px-2.5 py-0.5 text-xs font-semibold text-brand-gold">
        Needs review
      </span>
    );
  }
  if (app.partnerStage === "submit_queued_for_retry") {
    return (
      <span className="inline-flex items-center rounded-full bg-brand-rule px-2.5 py-0.5 text-xs font-semibold text-brand-muted">
        Re-trying
      </span>
    );
  }
  if (app.lastQualified === true) {
    return (
      <span className="inline-flex items-center rounded-full bg-brand-medium/15 px-2.5 py-0.5 text-xs font-semibold text-brand-medium">
        Qualified · awaiting carrier
      </span>
    );
  }
  if (app.lastQualified === false) {
    return (
      <span className="inline-flex items-center rounded-full bg-brand-rule px-2.5 py-0.5 text-xs font-semibold text-brand-muted">
        Not a match
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-brand-rule px-2.5 py-0.5 text-xs font-semibold text-brand-muted">
      Submitted
    </span>
  );
}

function ActionCard({
  href,
  title,
  body,
  primary,
}: {
  href: string;
  title: string;
  body: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        "block rounded-xl border p-5 transition-colors " +
        (primary
          ? "border-brand-deep bg-brand-deep text-brand-paper hover:bg-brand-medium"
          : "border-brand-rule bg-brand-paper text-brand-ink hover:bg-brand-surface")
      }
    >
      <p
        className={
          "text-base font-semibold " +
          (primary ? "text-brand-paper" : "text-brand-ink")
        }
      >
        {title} →
      </p>
      <p
        className={
          "mt-1 text-sm " + (primary ? "text-brand-paper/85" : "text-brand-muted")
        }
      >
        {body}
      </p>
    </Link>
  );
}

/** Coarse-grained relative time formatter used in alerts + header. */
function ageInWords(t: Date | null): string | null {
  if (!t) return null;
  const ms = Date.now() - t.getTime();
  if (ms < 0) return null;
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} day${d === 1 ? "" : "s"} ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w} week${w === 1 ? "" : "s"} ago`;
  const mo = Math.floor(d / 30);
  return `${mo} month${mo === 1 ? "" : "s"} ago`;
}
