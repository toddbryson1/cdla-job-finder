// Card for a public job listing pulled in from an external aggregator
// (Adzuna). Visually distinct from MatchCard because the trust story
// is different: we have no relationship with the carrier, so the
// driver applies directly with them and we don't share any info.
//
// Voice rule (per landing-page template Section 17): don't pretend we
// know more than we do. Don't promise the listing is current or
// accurate. Don't imply we'll follow up.

import type { ExternalMatch } from "@/lib/external-jobs";

interface Props {
  match: ExternalMatch;
}

function payLine(match: ExternalMatch): {
  primary: string;
  note: string | null;
} {
  const { payRangeMinWeekly: min, payRangeMaxWeekly: max, payIsEstimated } =
    match;
  const note = payIsEstimated
    ? "Pay estimated from similar jobs — not on the original posting."
    : null;
  if (min != null && max != null) {
    return {
      primary: `$${min.toLocaleString()}–$${max.toLocaleString()} / week`,
      note,
    };
  }
  if (max != null) {
    return { primary: `Up to $${max.toLocaleString()} / week`, note };
  }
  if (min != null) {
    return { primary: `From $${min.toLocaleString()} / week`, note };
  }
  return { primary: "Pay not listed", note: null };
}

function distanceLine(match: ExternalMatch): string {
  if (match.distanceMilesFromDriverHome == null) return "Location not specified";
  const m = Math.max(1, Math.round(match.distanceMilesFromDriverHome));
  return `${m.toLocaleString()} ${m === 1 ? "mile" : "miles"} from you`;
}

function sourceLabel(source: string): string {
  if (source === "adzuna") return "Adzuna";
  return source.charAt(0).toUpperCase() + source.slice(1);
}

export function ExternalJobCard({ match }: Props) {
  const pay = payLine(match);
  const distance = distanceLine(match);
  const location =
    match.city && match.state
      ? `${match.city}, ${match.state}`
      : match.state || match.city || "Location not specified";
  const company = match.companyName ?? "Unspecified carrier";
  const posted = match.postedAt
    ? new Date(match.postedAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <article className="rounded-xl border border-brand-rule bg-brand-surface p-5 sm:p-6">
      {/* Badge row — distinct from MatchCard's "Sponsored Match" etc. */}
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center rounded-full border border-brand-rule bg-brand-paper px-2.5 py-0.5 text-xs font-medium text-brand-muted">
          Open web listing
        </span>
        {posted ? (
          <span className="text-xs text-brand-muted">Posted {posted}</span>
        ) : null}
      </div>

      <h3 className="mt-3 text-lg font-semibold leading-snug text-brand-ink">
        {match.title}
      </h3>
      <p className="mt-1 text-sm text-brand-ink">{company}</p>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <dt className="text-xs uppercase tracking-wide text-brand-muted">
            Location
          </dt>
          <dd className="mt-0.5 text-brand-ink">{location}</dd>
          <dd className="text-xs text-brand-muted">{distance}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-brand-muted">
            Pay
          </dt>
          <dd className="mt-0.5 text-brand-ink">{pay.primary}</dd>
          {pay.note ? (
            <dd className="text-xs text-brand-muted">{pay.note}</dd>
          ) : null}
        </div>
      </dl>

      <p className="mt-4 text-xs leading-5 text-brand-muted">
        Public listing — we don&rsquo;t work with this carrier yet, so
        we can&rsquo;t share your info with them. Apply directly with{" "}
        {company} using the link below.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <a
          href={match.redirectUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="inline-flex h-11 items-center justify-center rounded-md border border-brand-rule bg-brand-paper px-5 text-sm font-medium text-brand-ink hover:bg-brand-surface"
        >
          View on {sourceLabel(match.source)} &rarr;
        </a>
      </div>
    </article>
  );
}
