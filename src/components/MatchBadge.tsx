import type { MatchLabel } from "@/lib/matching";

interface Props {
  label: MatchLabel;
}

const BADGE_COPY: Record<NonNullable<MatchLabel>, { tooltip: string }> = {
  "Sponsored Match": {
    tooltip: "This carrier subscribes to priority placement.",
  },
  "Referral Partner": {
    tooltip: "We have a direct referral agreement with this carrier.",
  },
  "Public Job Posting": {
    tooltip:
      "Public listing — we have not worked with this carrier directly yet.",
  },
};

const BADGE_STYLE: Record<NonNullable<MatchLabel>, string> = {
  "Sponsored Match":
    "bg-brand-gold/15 text-brand-deep ring-1 ring-inset ring-brand-gold/40",
  "Referral Partner":
    "bg-brand-medium/10 text-brand-deep ring-1 ring-inset ring-brand-medium/30",
  "Public Job Posting":
    "bg-brand-surface text-brand-muted ring-1 ring-inset ring-brand-rule",
};

export function MatchBadge({ label }: Props) {
  if (!label) return null;
  const copy = BADGE_COPY[label];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGE_STYLE[label]}`}
      title={copy.tooltip}
      aria-label={`${label}. ${copy.tooltip}`}
    >
      {label}
    </span>
  );
}
