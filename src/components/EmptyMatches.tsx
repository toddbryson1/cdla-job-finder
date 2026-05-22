interface Props {
  firstName: string | null;
}

export function EmptyMatches({ firstName }: Props) {
  const greeting = firstName ? `Hey ${firstName} — ` : "Hey — ";
  return (
    <div className="rounded-2xl border border-brand-rule bg-white p-6 sm:p-8 shadow-sm">
      <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-brand-ink">
        Nothing fits right now.
      </h2>
      <p className="mt-3 text-base leading-7 text-brand-ink">
        {greeting}none of the carriers we work with are hiring what you said you
        want in your area today. That is not on you — we add carriers constantly.
      </p>
      <p className="mt-3 text-base leading-7 text-brand-ink">
        We saved your profile. When a carrier opens a role that matches what you
        told us, we will email you. You do not need to do anything else right now.
      </p>
      <div className="mt-6 rounded-lg bg-brand-surface p-4 text-sm leading-6 text-brand-muted">
        <p className="font-medium text-brand-ink">
          If you want to see more options
        </p>
        <ul className="mt-2 list-disc pl-5 space-y-1.5">
          <li>
            Open up to OTR work or different equipment in your intake — it widens
            the pool significantly.
          </li>
          <li>
            If you would consider moving for the right job, turn on
            willing-to-relocate. That unlocks national OTR jobs that ignore the
            distance check.
          </li>
        </ul>
      </div>
    </div>
  );
}
