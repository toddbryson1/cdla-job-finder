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

import { Fragment } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getApplicationNudgeStats,
  getCarrierBreakdown,
  getCarrierHandoffDrift,
  getCarrierPerformance30d,
  getCyclesExpiringSoon,
  getDashboardCounts,
  getDriverFunnel30d,
  getFunnelEventStats,
  getPartnerHandoffFunnel,
  getPendingCarriersReviewQueue,
  getRecentActivity,
  getRecentArchivedJobs,
  getRecentConsents,
  getTaUnresolved,
  getUnsubscribeStats,
} from "@/lib/admin/dashboard-queries";
import { PendingCarrierActions } from "./PendingCarrierActions";
import { CarrierHandoffConfigEditor } from "./CarrierHandoffConfigEditor";

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
    pendingCarriers,
    partnerHandoff,
    handoffDrift,
    nudgeStats,
    unsubscribeStats,
    funnelEvents,
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
    getPendingCarriersReviewQueue(),
    getPartnerHandoffFunnel(),
    getCarrierHandoffDrift(),
    getApplicationNudgeStats(),
    getUnsubscribeStats(),
    getFunnelEventStats(30),
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

        {/* MATCHES PAGE VIEWS — event-log funnel (migration 0033). The
            section above reconstructs conversion from state tables;
            this reads actual /matches page-view events so drop-off at
            the view step (and 0-card dead-ends) is visible. */}
        <Section title="Funnel events — intake → view → consent (last 30 days)">
          {funnelEvents.matchesViewed === 0 &&
          funnelEvents.uniqueDriversIntake === 0 &&
          funnelEvents.consentEvents === 0 ? (
            <Empty>
              No funnel events yet. The funnel_events table starts empty on
              deploy and fills as drivers complete intake, load /matches, and
              consent — a fresh zero here means &ldquo;nothing logged since
              the table shipped,&rdquo; not a broken funnel.
            </Empty>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <CountCard
                  label="Intakes (events)"
                  value={funnelEvents.uniqueDriversIntake}
                  sub={
                    funnelEvents.uniqueDriversIntake > 0
                      ? `${((100 * funnelEvents.uniqueDriversViewed) / funnelEvents.uniqueDriversIntake).toFixed(1)}% intake→view`
                      : "unique drivers"
                  }
                  small
                />
                <CountCard
                  label="Page views"
                  value={funnelEvents.matchesViewed}
                  sub={`${funnelEvents.uniqueDriversViewed} unique drivers`}
                  small
                />
                <CountCard
                  label="Avg cards shown"
                  value={funnelEvents.avgMatchCount}
                  sub="internal + external"
                  small
                />
                <CountCard
                  label="Zero-card views"
                  value={funnelEvents.zeroMatchViews}
                  sub={
                    funnelEvents.matchesViewed > 0
                      ? `${((100 * funnelEvents.zeroMatchViews) / funnelEvents.matchesViewed).toFixed(1)}% dead-ends`
                      : "—"
                  }
                  small
                />
                <CountCard
                  label="Viewed → consented"
                  value={funnelEvents.viewedThenConsented}
                  sub={
                    funnelEvents.uniqueDriversViewed > 0
                      ? `${((100 * funnelEvents.viewedThenConsented) / funnelEvents.uniqueDriversViewed).toFixed(1)}% of viewers (state)`
                      : "—"
                  }
                  small
                />
                <CountCard
                  label="Consents (events)"
                  value={funnelEvents.consentEvents}
                  sub={
                    funnelEvents.uniqueDriversViewed > 0
                      ? `${((100 * funnelEvents.uniqueDriversConsented) / funnelEvents.uniqueDriversViewed).toFixed(1)}% view→consent (events)`
                      : `${funnelEvents.uniqueDriversConsented} unique drivers`
                  }
                  small
                />
              </div>
            </>
          )}
        </Section>

        {/* PARTNER HANDOFF FUNNEL — Anderson / Sterling QuickBase (spec §B7) */}
        <Section title="Partner handoff funnel — Anderson / Sterling QuickBase">
          {partnerHandoff.total === 0 ? (
            <Empty>
              No partner_application_stages rows yet. Either no Anderson
              driver has reached the Stage 2 result page, or QB push hasn&rsquo;t
              been live long enough to produce activity. Wire is in place
              (migration 0026 + sweeper + cron) and waiting on attorney
              clearance per spec §B11 before QUICKBASE_PUSH_ENABLED flips on.
            </Empty>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <CountCard
                  label="Total handoff rows"
                  value={partnerHandoff.total}
                  sub={`${partnerHandoff.totalAttempts} push attempts`}
                  small
                />
                <CountCard
                  label="Sterling confirmed"
                  value={partnerHandoff.sterlingConfirmed}
                  sub={
                    partnerHandoff.total > 0
                      ? `${((100 * partnerHandoff.sterlingConfirmed) / partnerHandoff.total).toFixed(1)}% of total`
                      : "—"
                  }
                  small
                />
                <CountCard
                  label="Retries overdue"
                  value={partnerHandoff.retryDueNow}
                  sub={
                    partnerHandoff.retryDueNow > 0
                      ? "next sweep due — check /api/cron/qb-retry"
                      : "all caught up"
                  }
                  small
                />
                <CountCard
                  label="Latest success"
                  value={
                    partnerHandoff.latestSubmissionAt
                      ? formatRelativeAge(partnerHandoff.latestSubmissionAt)
                      : "—"
                  }
                  sub={
                    partnerHandoff.latestSubmissionAt
                      ? partnerHandoff.latestSubmissionAt.toISOString().slice(0, 16) + "Z"
                      : "no submissions yet"
                  }
                  small
                />
              </div>

              <p className="mt-4 mb-2 text-xs uppercase tracking-wide text-brand-muted">
                Stage distribution
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <CountCard
                  label="intelliapp_link_sent"
                  value={partnerHandoff.byStage.intelliapp_link_sent}
                  sub="link delivered, push pending"
                  small
                />
                <CountCard
                  label="submitted_to_sterling"
                  value={partnerHandoff.byStage.submitted_to_sterling}
                  sub="terminal — success"
                  small
                />
                <CountCard
                  label="queued_for_retry"
                  value={partnerHandoff.byStage.submit_queued_for_retry}
                  sub="5xx pending backoff"
                  small
                />
                <CountCard
                  label="failed_validation"
                  value={partnerHandoff.byStage.submit_failed_validation}
                  sub="4xx — manual review"
                  small
                />
              </div>
            </>
          )}
        </Section>

        {/* CARRIER-CONFIG DRIFT — proactive signal so operators see
            misconfigured carriers BEFORE the retry sweeper terminates
            their pending rows. Same predicate as the sweeper, so what
            shows up here is exactly what would fail next. */}
        <Section title="Carrier-config drift — Anderson handoff">
          {handoffDrift.drifted.length === 0 ? (
            <Empty>
              All carriers with anderson_quickbase handoff have a valid
              partner_handoff_config. Nothing for the retry sweeper to
              choke on.
            </Empty>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <CountCard
                  label="Drifted carriers"
                  value={handoffDrift.drifted.length}
                  sub="config invalid for anderson_quickbase"
                  small
                />
                <CountCard
                  label="Pending rows doomed"
                  value={handoffDrift.totalPendingDoomed}
                  sub={
                    handoffDrift.totalPendingDoomed > 0
                      ? "will fail on the next sweep"
                      : "no pending rows on drifted carriers"
                  }
                  small
                />
                <CountCard
                  label="Already failed (historical)"
                  value={handoffDrift.totalHistoricalDriftRows}
                  sub="rows already terminated due to drift"
                  small
                />
              </div>

              <div className="mt-4">
                <Table>
                  <thead className="text-left text-xs uppercase tracking-wide text-brand-muted">
                    <tr>
                      <th className="px-3 py-2">Carrier</th>
                      <th className="px-3 py-2">Reason</th>
                      <th className="px-3 py-2 text-right">Pending (doomed)</th>
                      <th className="px-3 py-2 text-right">Historical</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-rule">
                    {handoffDrift.drifted.map((r) => (
                      <Fragment key={r.carrierId}>
                        <tr className="text-sm">
                          <td className="px-3 py-2 font-medium text-brand-ink">
                            {r.carrierName}
                          </td>
                          <td className="px-3 py-2 text-brand-muted">
                            <code className="text-xs">{r.code}</code>
                            <div className="text-xs">{r.reason}</div>
                          </td>
                          <td className="px-3 py-2 text-right">
                            {r.pendingRows > 0 ? (
                              <span className="font-semibold text-brand-deep">
                                {r.pendingRows}
                              </span>
                            ) : (
                              <span className="text-brand-muted">0</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-brand-muted">
                            {r.historicalDriftRows}
                          </td>
                        </tr>
                        <tr>
                          <td colSpan={4} className="px-3 pb-3">
                            <CarrierHandoffConfigEditor
                              carrierId={r.carrierId}
                              carrierName={r.carrierName}
                              current={r.currentConfig}
                              token={key ?? ""}
                            />
                          </td>
                        </tr>
                      </Fragment>
                    ))}
                  </tbody>
                </Table>
              </div>
              <p className="mt-2 text-xs text-brand-muted">
                Fix inline: each row has an{" "}
                <strong>Edit config</strong> form that writes a valid{" "}
                <code>quickbase</code> block (<code>realm_hostname</code>,{" "}
                <code>app_id</code>, <code>table_id</code>) under{" "}
                <code>handoff_type = &quot;anderson_quickbase&quot;</code>. The
                save is validated with the same predicate the retry sweeper
                uses, so a successful save clears the drift on refresh.
              </p>
            </>
          )}
        </Section>

        {/* APPLICATION-NUDGE RUNNER — "you haven't applied yet" email
            series. Operational visibility into the runner shipped in
            commit a55e251. */}
        <Section title="Application-nudge runner — &ldquo;you haven&rsquo;t applied yet&rdquo;">
          {nudgeStats.totalSent === 0 && nudgeStats.failedTotal === 0 ? (
            <Empty>
              No nudges sent yet. The runner fires from{" "}
              <code>/api/cron/daily</code> step 5.5 — drivers ≥24h past
              intake with 0 applications and ≥1 current match get nudge 1;
              ≥7d past intake with nudge 1 already sent get nudge 2. Empty
              here usually means GHL isn&rsquo;t configured, migration 0028
              hasn&rsquo;t been applied, or no drivers met the criteria yet.
            </Empty>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <CountCard
                  label="Total sent"
                  value={nudgeStats.totalSent}
                  sub={
                    nudgeStats.failedTotal > 0
                      ? `${nudgeStats.failedTotal} send failures`
                      : "no send failures"
                  }
                  small
                />
                <CountCard
                  label="Sent (last 7d)"
                  value={nudgeStats.sentLast7d}
                  sub={
                    nudgeStats.totalSent > 0
                      ? `${Math.round(
                          (100 * nudgeStats.sentLast7d) / nudgeStats.totalSent,
                        )}% of all-time`
                      : "—"
                  }
                  small
                />
                <CountCard
                  label="Conversion"
                  value={
                    nudgeStats.distinctDriversNudged > 0
                      ? `${Math.round(
                          (100 *
                            nudgeStats.distinctDriversConverted) /
                            nudgeStats.distinctDriversNudged,
                        )}%`
                      : "—"
                  }
                  sub={`${nudgeStats.distinctDriversConverted}/${nudgeStats.distinctDriversNudged} nudged drivers applied`}
                  small
                />
                <CountCard
                  label="Latest send"
                  value={
                    nudgeStats.latestSentAt
                      ? formatRelativeAge(nudgeStats.latestSentAt)
                      : "—"
                  }
                  sub={
                    nudgeStats.latestSentAt
                      ? nudgeStats.latestSentAt
                          .toISOString()
                          .slice(0, 16) + "Z"
                      : "never"
                  }
                  small
                />
              </div>

              <p className="mt-4 mb-2 text-xs uppercase tracking-wide text-brand-muted">
                Series distribution
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
                <CountCard
                  label="Nudge 1 (T+24h)"
                  value={nudgeStats.byNudgeIndex.nudge1}
                  sub="soft first-touch"
                  small
                />
                <CountCard
                  label="Nudge 2 (T+7d)"
                  value={nudgeStats.byNudgeIndex.nudge2}
                  sub={
                    nudgeStats.byNudgeIndex.nudge1 > 0
                      ? `${Math.round(
                          (100 * nudgeStats.byNudgeIndex.nudge2) /
                            nudgeStats.byNudgeIndex.nudge1,
                        )}% follow-through`
                      : "final, only fires if nudge 1 did"
                  }
                  small
                />
              </div>
              {nudgeStats.failedTotal > 0 ? (
                <p className="mt-3 text-xs text-brand-muted">
                  {nudgeStats.failedTotal} failed-send rows in{" "}
                  <code>driver_application_nudge_sends</code>. Check the
                  table&rsquo;s <code>error_message</code> column for
                  details — usually a GHL contact-upsert or bounced email.
                </p>
              ) : null}
            </>
          )}
        </Section>

        {/* EMAIL OPT-OUT RATE — CAN-SPAM unsubscribe signal. Watch
            for unsubscribed_last_7d climbing as a share of email-
            having drivers; cadence/copy needs work if it crosses
            ~2% per cohort. */}
        <Section title="Email opt-outs — CAN-SPAM unsubscribe rate">
          {unsubscribeStats.driversWithEmail === 0 ? (
            <Empty>
              No drivers with email yet — nothing to opt out of. The
              unsubscribed column starts mattering after the first round
              of email-bearing intakes.
            </Empty>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <CountCard
                label="Total unsubscribed"
                value={unsubscribeStats.totalUnsubscribed}
                sub={`${unsubscribeStats.driversWithEmail} drivers with email`}
                small
              />
              <CountCard
                label="Last 7 days"
                value={unsubscribeStats.unsubscribedLast7d}
                sub={
                  unsubscribeStats.driversWithEmail > 0
                    ? `${(
                        (100 * unsubscribeStats.unsubscribedLast7d) /
                        unsubscribeStats.driversWithEmail
                      ).toFixed(2)}% of addressable population`
                    : "—"
                }
                small
              />
              <CountCard
                label="Total rate"
                value={
                  unsubscribeStats.driversWithEmail > 0
                    ? `${(
                        (100 * unsubscribeStats.totalUnsubscribed) /
                        unsubscribeStats.driversWithEmail
                      ).toFixed(2)}%`
                    : "—"
                }
                sub={
                  unsubscribeStats.driversWithEmail > 0 &&
                  (100 * unsubscribeStats.totalUnsubscribed) /
                    unsubscribeStats.driversWithEmail >
                    2
                    ? "> 2%: revisit cadence + copy"
                    : "healthy zone"
                }
                small
              />
              <CountCard
                label="Latest opt-out"
                value={
                  unsubscribeStats.latestUnsubscribedAt
                    ? formatRelativeAge(unsubscribeStats.latestUnsubscribedAt)
                    : "—"
                }
                sub={
                  unsubscribeStats.latestUnsubscribedAt
                    ? unsubscribeStats.latestUnsubscribedAt
                        .toISOString()
                        .slice(0, 16) + "Z"
                    : "never"
                }
                small
              />
            </div>
          )}
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

        {/* PENDING CARRIERS REVIEW QUEUE */}
        <Section title="Carrier discovery — review queue">
          {pendingCarriers.length === 0 ? (
            <Empty>
              No pending carriers. Run{" "}
              <code className="rounded bg-brand-surface px-1 py-0.5 text-brand-ink">
                npx tsx scripts/discover-carrier.ts --name &quot;Carrier&quot; --url
                https://carrier.com --commit
              </code>{" "}
              to stage a discovered carrier here.
            </Empty>
          ) : (
            <>
              <p className="mb-3 text-xs text-brand-muted">
                Carriers found by the crawler awaiting review. Approve to
                promote into the live carriers + carrier_jobs tables (kind =
                prospect). Reject to keep the row staged but not promote.
                Per spec §9 Phase 1.
              </p>
              <Table>
                <thead className="text-left text-xs uppercase tracking-wide text-brand-muted">
                  <tr>
                    <th className="px-3 py-2">Carrier</th>
                    <th className="px-3 py-2 text-right">Jobs</th>
                    <th className="px-3 py-2">Surfaces</th>
                    <th className="px-3 py-2">Sample titles</th>
                    <th className="px-3 py-2">Discovered</th>
                    <th className="px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-rule">
                  {pendingCarriers.map((p) => (
                    <tr key={p.id} className="text-sm align-top">
                      <td className="px-3 py-2 font-medium text-brand-ink">
                        <div>{p.name}</div>
                        <a
                          href={p.careers_url ?? p.homepage_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-brand-muted underline"
                        >
                          {(p.careers_url ?? p.homepage_url).replace(
                            /^https?:\/\//,
                            "",
                          )}
                        </a>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {p.job_count}
                        {p.has_pay_data ? (
                          <div className="text-xs text-brand-muted">with pay</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-xs text-brand-muted">
                        {Object.entries(p.surface_breakdown).map(([k, v]) => (
                          <div key={k}>
                            {k.replace(/_/g, " ")}: {v}
                          </div>
                        ))}
                      </td>
                      <td className="px-3 py-2 text-xs text-brand-ink">
                        {p.sample_titles.map((t, i) => (
                          <div key={i} className="truncate max-w-xs">
                            {t}
                          </div>
                        ))}
                      </td>
                      <td className="px-3 py-2 text-xs text-brand-muted whitespace-nowrap">
                        {new Date(p.discovered_at).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-2">
                        <PendingCarrierActions
                          pendingCarrierId={p.id}
                          carrierName={p.name}
                          status={p.status}
                          token={key ?? ""}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </>
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
  // Most callsites pass a count; some pass a pre-formatted string
  // (e.g. "2h ago" for the latest-handoff timestamp card).
  value: number | string;
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

/**
 * Coarse-grained relative-time formatter for the admin dashboard
 * "latest success" card. Operator wants "2 hours ago" / "3 days ago",
 * not "2026-06-02T14:15:00Z". The exact timestamp shows in the sub-
 * caption beneath. No external date library needed at this precision.
 */
function formatRelativeAge(t: Date): string {
  const ms = Date.now() - t.getTime();
  if (ms < 0) return "future";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  const mo = Math.floor(d / 30);
  return `${mo}mo ago`;
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
