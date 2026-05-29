// /admin — operational dashboard.
//
// Gated on ADMIN_TOKEN env var matching a `?key=...` query param. No
// session auth (no UI to maintain). Token-only is fine because the
// page is read-only — no writes can happen from here. Add it to
// robots.txt Disallow so it never gets indexed.
//
// Shows the things that aren't easily seen from Drizzle Studio or
// Vercel logs: per-carrier breakdown, recent activity, cycles about
// to expire, TA unresolved openings, recently archived jobs.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getCarrierBreakdown,
  getCarrierPerformance30d,
  getCyclesExpiringSoon,
  getDashboardCounts,
  getDriverFunnel30d,
  getRecentActivity,
  getRecentArchivedJobs,
  getRecentConsents,
  getTaUnresolved,
} from "@/lib/admin/dashboard-queries";

export const dynamic = "force-dynamic"; // never cache
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ key?: string }>;
}

function checkToken(provided: string | undefined): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected || expected.length < 16) return false; // refuse to operate without a strong token
  return provided === expected;
}

export default async function AdminPage({ searchParams }: PageProps) {
  const { key } = await searchParams;
  if (!checkToken(key)) {
    // Don't leak the existence of the page. Return a generic 404.
    notFound();
  }

  // Run queries in parallel
  const [
    counts,
    breakdown,
    activity,
    expiring,
    taUnresolved,
    recentArchived,
    funnel,
    carrierPerf,
    recentConsents,
  ] = await Promise.all([
    getDashboardCounts(),
    getCarrierBreakdown(),
    getRecentActivity(),
    getCyclesExpiringSoon(5),
    getTaUnresolved(),
    getRecentArchivedJobs(10),
    getDriverFunnel30d(),
    getCarrierPerformance30d(),
    getRecentConsents(20),
  ]);

  const minimalTotal = breakdown.reduce(
    (sum, b) => sum + b.by_quality.minimal,
    0,
  );

  return (
    <main className="min-h-screen bg-brand-surface">
      <div className="mx-auto max-w-6xl px-5 py-8 sm:py-12">
        <header className="mb-8">
          <p className="text-xs uppercase tracking-wide text-brand-muted">
            CDLA.jobs
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-brand-ink">
            Admin
          </h1>
          <p className="mt-1 text-sm text-brand-muted">
            Read-only. Refresh to see current state. As of{" "}
            {new Date().toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
            .
          </p>
        </header>

        {/* HEADLINE COUNTS */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <CountCard
            label="Active carriers"
            value={counts.carriers.active}
            sub={`${counts.carriers.partner} partner · ${counts.carriers.subscription} sub · ${counts.carriers.prospect} prospect`}
          />
          <CountCard
            label="Active jobs"
            value={counts.carrierJobs.active}
            sub={`${counts.carrierJobs.archived} archived`}
          />
          <CountCard
            label="Active cycles"
            value={counts.postingCycles.active}
            sub={`${counts.postingCycles.primary} primary · ${counts.postingCycles.expired} expired ever`}
          />
          <CountCard
            label="Minimal-quality jobs"
            value={minimalTotal}
            sub="needs detail-tab data"
          />
        </section>

        {/* PER-CARRIER BREAKDOWN */}
        <Section title="Per carrier">
          <Table>
            <thead className="text-left text-xs uppercase tracking-wide text-brand-muted">
              <tr>
                <th className="px-3 py-2">Carrier</th>
                <th className="px-3 py-2">Kind</th>
                <th className="px-3 py-2 text-right">Active jobs</th>
                <th className="px-3 py-2 text-right">Active cycles</th>
                <th className="px-3 py-2 text-right">Complete</th>
                <th className="px-3 py-2 text-right">Partial</th>
                <th className="px-3 py-2 text-right">Minimal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-rule">
              {breakdown.map((r) => (
                <tr key={r.name} className="text-sm">
                  <td className="px-3 py-2 font-medium text-brand-ink">
                    {r.name}
                  </td>
                  <td className="px-3 py-2 text-brand-muted">{r.kind}</td>
                  <td className="px-3 py-2 text-right">{r.active_jobs}</td>
                  <td className="px-3 py-2 text-right">{r.active_cycles}</td>
                  <td className="px-3 py-2 text-right">
                    {r.by_quality.complete}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {r.by_quality.partial}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {r.by_quality.minimal}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Section>

        {/* LAST 24H ACTIVITY */}
        <Section title="Last 24 hours">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {activity.map((r) => (
              <CountCard
                key={r.bucket}
                label={r.bucket}
                value={r.count}
                small
              />
            ))}
          </div>
        </Section>

        {/* DRIVER FUNNEL (last 30d) */}
        <Section title="Driver funnel — last 30 days">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <CountCard
              label="Intakes"
              value={funnel.intakes}
              sub={`${funnel.intakesWithAnyMatch} with ≥1 match · ${funnel.intakesWithAnyConsent} consented`}
              small
            />
            <CountCard
              label="Impressions"
              value={funnel.totalImpressions}
              sub={
                funnel.intakes > 0
                  ? `${(funnel.totalImpressions / funnel.intakes).toFixed(1)} avg/intake`
                  : "—"
              }
              small
            />
            <CountCard
              label="Consents"
              value={funnel.totalConsents}
              sub={
                funnel.totalImpressions > 0
                  ? `${((100 * funnel.totalConsents) / funnel.totalImpressions).toFixed(1)}% of impressions`
                  : "—"
              }
              small
            />
            <CountCard
              label="Qualified"
              value={funnel.totalQualified}
              sub={
                funnel.totalConsents > 0
                  ? `${((100 * funnel.totalQualified) / funnel.totalConsents).toFixed(1)}% of consents`
                  : "—"
              }
              small
            />
          </div>
          <p className="mt-4 mb-2 text-xs uppercase tracking-wide text-brand-muted">
            Match-count distribution
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <CountCard
              label="0 matches"
              value={funnel.matchCountBuckets.zero}
              sub="supply gap"
              small
            />
            <CountCard
              label="1 match"
              value={funnel.matchCountBuckets.one}
              small
            />
            <CountCard
              label="2–4 matches"
              value={funnel.matchCountBuckets.twoToFour}
              small
            />
            <CountCard
              label="5+ matches"
              value={funnel.matchCountBuckets.fivePlus}
              sub="strong fit"
              small
            />
          </div>
        </Section>

        {/* PER-CARRIER PERFORMANCE (last 30d) */}
        <Section title="Per-carrier performance — last 30 days">
          {carrierPerf.length === 0 ? (
            <Empty>No carrier activity in the last 30 days.</Empty>
          ) : (
            <Table>
              <thead className="text-left text-xs uppercase tracking-wide text-brand-muted">
                <tr>
                  <th className="px-3 py-2">Carrier</th>
                  <th className="px-3 py-2">Tier</th>
                  <th className="px-3 py-2 text-right">Impressions</th>
                  <th className="px-3 py-2 text-right">Consents</th>
                  <th className="px-3 py-2 text-right">Consent rate</th>
                  <th className="px-3 py-2 text-right">Qualified</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-rule">
                {carrierPerf.map((r) => (
                  <tr key={r.carrier} className="text-sm">
                    <td className="px-3 py-2 font-medium text-brand-ink">
                      {r.carrier}
                    </td>
                    <td className="px-3 py-2 text-brand-muted">
                      {r.tier === "tier_1"
                        ? "Tier 1"
                        : r.tier === "tier_2"
                          ? "Tier 2"
                          : r.kind}
                    </td>
                    <td className="px-3 py-2 text-right">{r.impressions}</td>
                    <td className="px-3 py-2 text-right">{r.consents}</td>
                    <td className="px-3 py-2 text-right">
                      {r.consent_rate_pct.toFixed(1)}%
                    </td>
                    <td className="px-3 py-2 text-right">{r.qualified}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Section>

        {/* RECENT CONSENTS */}
        <Section title="Recent consents (last 20)">
          {recentConsents.length === 0 ? (
            <Empty>No consents yet.</Empty>
          ) : (
            <Table>
              <thead className="text-left text-xs uppercase tracking-wide text-brand-muted">
                <tr>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Driver</th>
                  <th className="px-3 py-2">CDL state</th>
                  <th className="px-3 py-2">Carrier</th>
                  <th className="px-3 py-2">Position</th>
                  <th className="px-3 py-2">Qualified?</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-rule">
                {recentConsents.map((r, i) => (
                  <tr key={i} className="text-sm">
                    <td className="px-3 py-2 text-brand-muted">
                      {new Date(r.consented_at).toLocaleString(undefined, {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="px-3 py-2 text-brand-ink">
                      {r.driver_first_name}
                    </td>
                    <td className="px-3 py-2 text-brand-muted">
                      {r.cdl_state}
                    </td>
                    <td className="px-3 py-2 text-brand-muted">{r.carrier}</td>
                    <td className="px-3 py-2 text-brand-ink">
                      {r.position_title}
                    </td>
                    <td className="px-3 py-2 text-brand-muted">
                      {r.qualified === null
                        ? "—"
                        : r.qualified
                          ? "✓"
                          : "no"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Section>

        {/* CYCLES EXPIRING */}
        <Section title="Cycles expiring in next 5 days">
          {expiring.length === 0 ? (
            <Empty>No cycles expire in the next 5 days.</Empty>
          ) : (
            <Table>
              <thead className="text-left text-xs uppercase tracking-wide text-brand-muted">
                <tr>
                  <th className="px-3 py-2">Carrier</th>
                  <th className="px-3 py-2">Position</th>
                  <th className="px-3 py-2">City</th>
                  <th className="px-3 py-2 text-right">Days left</th>
                  <th className="px-3 py-2">Expires</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-rule">
                {expiring.map((r, i) => (
                  <tr key={i} className="text-sm">
                    <td className="px-3 py-2 text-brand-muted">{r.carrier}</td>
                    <td className="px-3 py-2 text-brand-ink">
                      {r.position_title}
                    </td>
                    <td className="px-3 py-2 text-brand-muted">
                      {r.city}, {r.state}
                    </td>
                    <td className="px-3 py-2 text-right">{r.days_left}</td>
                    <td className="px-3 py-2 text-brand-muted">
                      {new Date(r.expires_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Section>

        {/* TA UNRESOLVED */}
        <Section title="Transport America — review queue">
          {taUnresolved.length === 0 ? (
            <Empty>No TA jobs found.</Empty>
          ) : (
            <>
              <p className="mb-3 text-xs text-brand-muted">
                Run{" "}
                <code className="rounded bg-brand-surface px-1 py-0.5 text-brand-ink">
                  npx tsx scripts/ta-review.ts
                </code>{" "}
                to confirm mappings for the minimal-quality rows. After
                review, the next daily sync upgrades those to
                partial/complete.
              </p>
              <Table>
                <thead className="text-left text-xs uppercase tracking-wide text-brand-muted">
                  <tr>
                    <th className="px-3 py-2">Division (position title)</th>
                    <th className="px-3 py-2">City</th>
                    <th className="px-3 py-2">Quality</th>
                    <th className="px-3 py-2">Mapped?</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-rule">
                  {taUnresolved.map((r, i) => (
                    <tr key={i} className="text-sm">
                      <td className="px-3 py-2 text-brand-ink">{r.division}</td>
                      <td className="px-3 py-2 text-brand-muted">
                        {r.city ?? "?"}, {r.state ?? "?"}
                      </td>
                      <td className="px-3 py-2">
                        <QualityBadge tier={r.data_quality} />
                      </td>
                      <td className="px-3 py-2 text-brand-muted">
                        {r.has_mapping ? "✓" : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </>
          )}
        </Section>

        {/* RECENTLY ARCHIVED */}
        <Section title="Recently archived (last 10)">
          {recentArchived.length === 0 ? (
            <Empty>No archived jobs.</Empty>
          ) : (
            <Table>
              <thead className="text-left text-xs uppercase tracking-wide text-brand-muted">
                <tr>
                  <th className="px-3 py-2">Carrier</th>
                  <th className="px-3 py-2">Position</th>
                  <th className="px-3 py-2">City</th>
                  <th className="px-3 py-2">Archived at</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-rule">
                {recentArchived.map((r, i) => (
                  <tr key={i} className="text-sm">
                    <td className="px-3 py-2 text-brand-muted">{r.carrier}</td>
                    <td className="px-3 py-2 text-brand-ink">
                      {r.position_title}
                    </td>
                    <td className="px-3 py-2 text-brand-muted">
                      {r.city}, {r.state}
                    </td>
                    <td className="px-3 py-2 text-brand-muted">
                      {new Date(r.archived_at).toLocaleString(undefined, {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Section>

        <footer className="mt-12 text-xs text-brand-muted">
          Read-only. No writes happen from this page. Token authentication
          via ADMIN_TOKEN env var.
        </footer>
      </div>
    </main>
  );
}

function CountCard({
  label,
  value,
  sub,
  small,
}: {
  label: string;
  value: number;
  sub?: string;
  small?: boolean;
}) {
  return (
    <div className="rounded-xl border border-brand-rule bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-brand-muted">
        {label}
      </div>
      <div
        className={
          "mt-1 font-semibold text-brand-ink " +
          (small ? "text-xl" : "text-3xl")
        }
      >
        {value.toLocaleString()}
      </div>
      {sub ? <div className="mt-1 text-xs text-brand-muted">{sub}</div> : null}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-muted">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-brand-rule bg-white">
      <table className="w-full">{children}</table>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-brand-rule bg-white p-4 text-sm text-brand-muted">
      {children}
    </div>
  );
}

function QualityBadge({ tier }: { tier: string }) {
  const styles: Record<string, string> = {
    complete: "bg-brand-medium/15 text-brand-medium",
    partial: "bg-brand-gold/15 text-brand-gold",
    minimal: "bg-brand-rule text-brand-muted",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        styles[tier] ?? "bg-brand-rule text-brand-muted"
      }`}
    >
      {tier}
    </span>
  );
}
