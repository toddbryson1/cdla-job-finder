import type { Metadata } from "next";
import { IntakeForm } from "@/components/IntakeForm";

export const metadata: Metadata = {
  title: "Driver intake",
  description:
    "Tell us once what you're looking for and what you bring. We'll match you to carriers actually hiring. Six minutes.",
  robots: { index: false, follow: false },
};

export default function IntakePage() {
  return (
    <main className="min-h-screen bg-brand-surface">
      <div className="mx-auto max-w-2xl px-5 py-10 sm:py-14">
        <header className="mb-8">
          <p className="text-sm font-medium text-brand-medium">CDLA.jobs</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-brand-ink">
            Tell us once.
          </h1>
          <p className="mt-3 text-base leading-7 text-brand-muted">
            About 6 minutes. We&rsquo;ll match you to carriers actually hiring what
            you want to drive. You pick which carriers see your info. Nobody else does.
          </p>
        </header>
        <IntakeForm />
      </div>
    </main>
  );
}
