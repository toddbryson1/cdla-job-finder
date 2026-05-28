import type { Metadata } from "next";
import { CarrierShell } from "@/components/CarrierPage";
import { BriefForm } from "./BriefForm";

export const metadata: Metadata = {
  title: "Carrier brief — CDLA.jobs",
  description:
    "One-page brief on how CDLA.jobs delivers matched CDL-A drivers to your ATS. Free PDF, sent to your inbox.",
  robots: { index: false, follow: false },
  alternates: { canonical: "https://www.cdla.jobs/partners/brief" },
};

export default function CarrierBriefPage() {
  return (
    <CarrierShell>
      <section>
        <div className="mx-auto max-w-3xl px-6 pb-16 pt-14 sm:pb-20 sm:pt-20">
          <p className="text-xs font-medium uppercase tracking-wider text-brand-medium">
            Carrier brief
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-brand-ink sm:text-4xl">
            One page on how CDLA.jobs delivers matched CDL-A drivers to your
            ATS.
          </h1>
          <p className="mt-5 text-base leading-7 text-brand-ink">
            Tell us where to send it and we&rsquo;ll email the PDF. It covers
            the model (we&rsquo;re not a job board), the pricing (Tier 2 free,
            Tier 1 $2,500/month flat, no per-hire fees), and what your team
            does vs. what we do.
          </p>
          <p className="mt-3 text-sm text-brand-muted">
            We don&rsquo;t send a multi-week drip. One email with the brief,
            and a follow-up from sales only if you ask for one.
          </p>
          <div className="mt-8">
            <BriefForm />
          </div>
        </div>
      </section>
    </CarrierShell>
  );
}
