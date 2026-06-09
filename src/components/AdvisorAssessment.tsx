import type { Assessment } from "@/lib/advisor/assessment";

// The honest "here's where you stand" panel that opens the advisor match
// view. Strengths first, then "what's working against you" — every
// weakness shown WITH its path forward (never a verdict). Server
// component; no interactivity.

export function AdvisorAssessment({
  firstName,
  assessment,
}: {
  firstName: string;
  assessment: Assessment;
}) {
  const { strengths, weaknesses } = assessment;
  if (strengths.length === 0 && weaknesses.length === 0) return null;

  return (
    <section className="mt-6 rounded-xl border border-brand-rule bg-brand-paper p-5 shadow-sm">
      <h2 className="text-base font-semibold text-brand-ink">
        {firstName ? `${firstName}, here's where you stand` : "Where you stand"}
      </h2>
      <p className="mt-1 text-sm leading-6 text-brand-muted">
        Straight read on your search — the good and the hard. The hard parts
        come with what you can do about them.
      </p>

      {strengths.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-medium">
            Where you&rsquo;re strong
          </h3>
          <ul className="mt-2 space-y-1.5">
            {strengths.map((s, i) => (
              <li key={i} className="flex gap-2 text-sm leading-6 text-brand-ink">
                <span aria-hidden="true" className="text-brand-medium">
                  ✓
                </span>
                <span>{s.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {weaknesses.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-muted">
            What&rsquo;s working against you
          </h3>
          <ul className="mt-2 space-y-2.5">
            {weaknesses.map((w, i) => (
              <li key={i} className="text-sm leading-6">
                <p className="text-brand-ink">{w.label}</p>
                <p className="mt-0.5 flex gap-2 text-brand-muted">
                  <span aria-hidden="true" className="text-brand-gold">
                    →
                  </span>
                  <span>{w.pathForward}</span>
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
