"use client";

import { useState } from "react";
import Link from "next/link";
import type { Match } from "@/lib/matching";
import type { MatchDisplayExtras } from "@/lib/match-display-data";
import { EQUIPMENT } from "@/lib/slugs";
import { MatchBadge } from "./MatchBadge";

interface Props {
  driverId: string;
  match: Match;
  extras: MatchDisplayExtras | undefined;
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

export function MatchCard({ driverId, match, extras }: Props) {
  const [expanded, setExpanded] = useState(false);
  const pay = payLine(match);
  const distance = distanceLine(match);
  const equipment = equipmentLabel(match.equipment);
  const vNote = verificationNote(match, extras?.lastVerifiedAt ?? null);
  const applyHref = `/match/${driverId}/${match.jobId}/apply`;
  const contentId = `match-${match.jobId}-detail`;

  return (
    <article className="rounded-2xl border border-brand-rule bg-white shadow-sm transition-shadow hover:shadow-md">
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
          {extras?.description ? (
            <section>
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

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href={applyHref}
              className="inline-flex h-11 items-center justify-center rounded-md bg-brand-deep px-5 text-sm font-semibold text-white hover:bg-brand-medium transition-colors"
            >
              Continue to apply
            </Link>
            <span className="text-xs text-brand-muted">
              You decide what to share before anything goes to the carrier.
            </span>
          </div>
        </div>
      ) : null}
    </article>
  );
}
