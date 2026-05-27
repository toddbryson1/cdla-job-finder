"use client";

import { useState } from "react";
import Link from "next/link";
import type { Match } from "@/lib/matching";
import type { MatchDisplayExtras } from "@/lib/match-display-data";
import { EQUIPMENT } from "@/lib/slugs";
import { buildJobPostingSlugFromFields } from "@/lib/job-slug";
import { AskDebbie } from "./AskDebbie";
import { MatchBadge } from "./MatchBadge";

interface Props {
  driverId: string;
  match: Match;
  extras: MatchDisplayExtras | undefined;
  /**
   * Non-null if the driver has already pursued this carrier (consented
   * through Stage 2). Drives the "You pursued this" badge and a softened
   * CTA label so the driver knows where they left off.
   */
  pursuit: {
    consentedAt: Date | string;
    lastQualified: boolean | null;
  } | null;
}

function equipmentLabel(slug: string): string {
  const known = EQUIPMENT[slug];
  if (known) return known.displayName;
  return slug
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}

function payLine(match: Match): { primary: string; note: string | null } {
  const min = match.payRangeMinWeekly;
  const max = match.payRangeMaxWeekly;
  if (min != null && max != null) {
    return {
      primary: `$${min.toLocaleString()}–$${max.toLocaleString()} / week`,
      note: null,
    };
  }
  if (max != null) {
    return { primary: `Up to $${max.toLocaleString()} / week`, note: null };
  }
  return {
    primary: "Pay not listed",
    note: "Carrier did not publish a pay range.",
  };
}

function distanceLine(match: Match): string {
  if (match.distanceMilesFromDriverHome == null) return "Drives nationwide";
  const m = Math.max(1, Math.round(match.distanceMilesFromDriverHome));
  return `${m.toLocaleString()} ${m === 1 ? "mile" : "miles"} from you`;
}

function verificationNote(match: Match, lastVerifiedAt: Date | null): string | null {
  if (match.verificationStatus === "verified") return null;
  if (lastVerifiedAt) {
    const verified = lastVerifiedAt.toLocaleDateString(undefined, {
      month: "short",
      year: "numeric",
    });
    return `Listing last verified ${verified} — details may have changed.`;
  }
  return "We have not been able to verify this listing recently — details may have changed.";
}

export function MatchCard({ driverId, match, extras, pursuit }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [askDebbieOpen, setAskDebbieOpen] = useState(false);
  const pay = payLine(match);
  const distance = distanceLine(match);
  const equipment = equipmentLabel(match.equipment);
  const vNote = verificationNote(match, extras?.lastVerifiedAt ?? null);
  const applyHref = `/match/${driverId}/${match.jobId}/apply`;
  const jobPostingHref = `/job/${buildJobPostingSlugFromFields({
    carrierName: match.carrierName,
    jobId: match.jobId,
    positionTitle: match.positionTitle,
    domicileCity: match.domicileCity,
    domicileState: match.domicileState,
  })}`;
  const contentId = `match-${match.jobId}-detail`;
  const pursuedDate =
    pursuit && pursuit.consentedAt
      ? new Date(pursuit.consentedAt).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        })
      : null;

  return (
    <article
      className={
        "rounded-2xl border bg-white shadow-sm transition-shadow hover:shadow-md " +
        (pursuit ? "border-brand-medium/60" : "border-brand-rule")
      }
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={contentId}
        className="w-full text-left p-5 sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {match.label ? <MatchBadge label={match.label} /> : null}
              {pursuit ? (
                <span className="inline-flex items-center rounded-full bg-brand-medium/15 px-2.5 py-0.5 text-xs font-semibold text-brand-medium">
                  {pursuit.lastQualified === false
                    ? "Not a match"
                    : "You pursued this"}
                  {pursuedDate ? ` · ${pursuedDate}` : ""}
                </span>
              ) : null}
              <span className="text-xs text-brand-muted">{match.carrierName}</span>
            </div>
            <h2 className="mt-2 text-lg sm:text-xl font-semibold leading-snug text-brand-ink">
              {match.positionTitle}
            </h2>
          </div>
          <span
            className="shrink-0 text-xs font-medium text-brand-medium"
            aria-hidden="true"
          >
            {expanded ? "Hide details" : "View details"}
          </span>
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-wide text-brand-muted">
              Equipment
            </dt>
            <dd className="mt-0.5 text-sm font-medium text-brand-ink">
              {equipment}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-brand-muted">
              Domicile
            </dt>
            <dd className="mt-0.5 text-sm font-medium text-brand-ink">
              {match.domicileCity}, {match.domicileState}
            </dd>
            <dd className="text-xs text-brand-muted">{distance}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-brand-muted">
              Pay
            </dt>
            <dd className="mt-0.5 text-sm font-medium text-brand-ink">
              {pay.primary}
            </dd>
            {pay.note ? (
              <dd className="text-xs text-brand-muted">{pay.note}</dd>
            ) : null}
          </div>
        </dl>
      </button>

      {expanded ? (
        <div
          id={contentId}
          className="border-t border-brand-rule px-5 pb-6 pt-5 sm:px-6"
        >
          {extras?.displayLaneDescription ? (
            <section>
              <h3 className="text-xs uppercase tracking-wide text-brand-muted">
                Lane
              </h3>
              <p className="mt-1.5 text-sm leading-6 text-brand-ink">
                {extras.displayLaneDescription}
              </p>
            </section>
          ) : null}

          {extras?.description ? (
            <section className={extras?.displayLaneDescription ? "mt-4" : ""}>
              <h3 className="text-xs uppercase tracking-wide text-brand-muted">
                About the job
              </h3>
              <p className="mt-1.5 whitespace-pre-line text-sm leading-6 text-brand-ink">
                {extras.description}
              </p>
            </section>
          ) : null}

          {extras?.displayHomeTimeDescription ? (
            <section className="mt-4">
              <h3 className="text-xs uppercase tracking-wide text-brand-muted">
                Home time
              </h3>
              <p className="mt-1.5 text-sm leading-6 text-brand-ink">
                {extras.displayHomeTimeDescription}
              </p>
            </section>
          ) : null}

          {extras?.displayBenefitsSummary ? (
            <section className="mt-4">
              <h3 className="text-xs uppercase tracking-wide text-brand-muted">
                Benefits
              </h3>
              <p className="mt-1.5 text-sm leading-6 text-brand-ink">
                {extras.displayBenefitsSummary}
              </p>
            </section>
          ) : null}

          {extras?.displaySigningBonusUsd != null &&
          extras.displaySigningBonusUsd > 0 ? (
            <section className="mt-4">
              <h3 className="text-xs uppercase tracking-wide text-brand-muted">
                Signing bonus
              </h3>
              <p className="mt-1.5 text-sm font-medium text-brand-ink">
                ${extras.displaySigningBonusUsd.toLocaleString()}
              </p>
            </section>
          ) : null}

          {vNote ? (
            <p className="mt-5 text-xs text-brand-muted">{vNote}</p>
          ) : null}

          <p className="mt-3 text-xs text-brand-muted">
            <Link
              href={jobPostingHref}
              className="underline hover:text-brand-ink"
              onClick={(e) => e.stopPropagation()}
            >
              View the full posting
            </Link>
            {" — public job page with the carrier's full listing."}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href={applyHref}
              className="inline-flex h-11 items-center justify-center rounded-md bg-brand-deep px-5 text-sm font-semibold text-white hover:bg-brand-medium transition-colors"
            >
              {pursuit
                ? pursuit.lastQualified === false
                  ? "Review result"
                  : "Pick up where you left off"
                : "Continue to apply"}
            </Link>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setAskDebbieOpen(true);
              }}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-brand-rule bg-white px-4 text-sm font-medium text-brand-ink hover:border-brand-medium hover:bg-brand-surface"
            >
              <span
                aria-hidden="true"
                className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-deep text-[10px] font-semibold text-white"
              >
                D
              </span>
              Ask Debbie
            </button>
            <span className="text-xs text-brand-muted">
              {pursuit
                ? "You already consented for this carrier. You can re-open it any time."
                : "You decide what to share before anything goes to the carrier."}
            </span>
          </div>
        </div>
      ) : null}
      <AskDebbie
        driverId={driverId}
        jobId={match.jobId}
        carrierName={match.carrierName}
        positionTitle={match.positionTitle}
        open={askDebbieOpen}
        onClose={() => setAskDebbieOpen(false)}
      />
    </article>
  );
}
