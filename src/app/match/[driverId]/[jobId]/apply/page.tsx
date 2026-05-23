import type { Metadata } from "next";
import Link from "next/link";

// TODO: build Stage 2 qualifying flow

export const metadata: Metadata = {
  title: "Apply",
  description: "Per-carrier qualifying step (coming soon).",
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ driverId: string; jobId: string }>;
}

export default async function ApplyStubPage({ params }: PageProps) {
  const { driverId } = await params;
  return (
    <main className="min-h-screen bg-brand-surface">
      <div className="mx-auto max-w-2xl px-5 py-16 sm:py-24">
        <div className="rounded-2xl border border-brand-rule bg-white p-8 sm:p-10 shadow-sm">
          <p className="text-sm font-medium text-brand-medium">CDLA.jobs</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-brand-ink">
            This is where the application step will go.
          </h1>
          <p className="mt-4 text-base leading-7 text-brand-ink">
            Coming soon. Before anything goes to the carrier, we will ask you a
            few more questions specific to them — and you decide whether to send
            it.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={`/matches/${driverId}`}
              className="inline-flex h-11 items-center justify-center rounded-md border border-brand-rule px-5 text-sm font-medium text-brand-ink hover:bg-brand-surface"
            >
              Back to your matches
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
