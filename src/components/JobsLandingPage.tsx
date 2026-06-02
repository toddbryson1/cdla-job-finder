import Link from "next/link";
import type { ParsedSlug } from "@/lib/slugs";
import type { PageData } from "@/lib/page-data";
import { STANDARD_FAQ } from "@/lib/driver-faq";

interface Props {
  parsed: ParsedSlug;
  data: PageData;
}

/**
 * Driver-facing region/equipment landing page.
 * Copy is canonical per docs/CDLAjobs_Driver_Landing_Page_Template.docx — do not
 * improvise headlines or microcopy (Section 17).
 */
export function JobsLandingPage({ parsed, data }: Props) {
  const totalCarriers = data.activePartnerCount + data.prospectCount;
  const showLowDataVariant = totalCarriers < 3;

  return (
    <main className="flex flex-col gap-16 pb-16">
      <Hero parsed={parsed} data={data} />
      <TrustSignal parsed={parsed} data={data} lowData={showLowDataVariant} />
      <HowItWorks parsed={parsed} />
      {data.payLow !== null && data.payHigh !== null && (
        <Pay parsed={parsed} data={data} />
      )}
      <FAQ parsed={parsed} />
      <FinalCTA parsed={parsed} data={data} />
      <Footer />
    </main>
  );
}

function Hero({ parsed, data }: Props) {
  const { regionInfo, equipmentInfo } = parsed;
  const useCountVariant = data.activePartnerCount >= 5;

  const headline = useCountVariant
    ? `${data.activePartnerCount} carriers in ${regionInfo.displayName} are hiring ${equipmentInfo.humanized} right now.`
    : `${equipmentInfo.displayName} jobs in ${regionInfo.displayName}. We do the searching.`;

  return (
    <section className="bg-brand-deep text-brand-paper">
      <div className="mx-auto max-w-3xl px-5 pt-14 pb-12 sm:pt-20 sm:pb-16">
        <h1 className="text-3xl sm:text-4xl font-semibold leading-tight tracking-tight">
          {headline}
        </h1>
        <p className="mt-5 text-lg leading-7 text-brand-paper/85">
          Tell us once what you&rsquo;re looking for. We match you with carriers
          actually hiring {equipmentInfo.humanized} in {regionInfo.humanized}. No
          applying to 40 jobs. No 2 AM recruiter calls about jobs that don&rsquo;t fit.
        </p>
        <div className="mt-7 flex flex-col items-start gap-3">
          <a
            href="/intake"
            className="inline-flex h-14 items-center justify-center rounded-md bg-brand-gold px-7 text-base font-semibold text-brand-ink hover:bg-brand-gold/90 transition-colors"
          >
            Find my matches
          </a>
          <p className="text-sm text-brand-paper/75">
            Takes 6 minutes. Free. We don&rsquo;t sell your info.
          </p>
        </div>
      </div>
    </section>
  );
}

function TrustSignal({ parsed, data, lowData }: Props & { lowData: boolean }) {
  const { regionInfo } = parsed;

  if (lowData) {
    return (
      <section className="mx-auto max-w-3xl px-5">
        <div className="rounded-xl border border-brand-rule bg-brand-surface p-6">
          <p className="text-base leading-7 text-brand-ink">
            We&rsquo;re growing in {regionInfo.displayName}. Tell us what you want
            and we&rsquo;ll match you to the carriers we work with &mdash; plus we&rsquo;ll
            add you to the list for new opportunities as they come up.
          </p>
        </div>
      </section>
    );
  }

  const cards: Array<{ value: string; label: string }> = [
    {
      value: `${data.totalCarrierCount}`,
      label: `carriers hiring in ${regionInfo.displayName}`,
    },
  ];
  if (data.payLow !== null && data.payHigh !== null) {
    cards.push({
      value: `$${data.payLow.toLocaleString()} – $${data.payHigh.toLocaleString()}`,
      label: "typical weekly pay",
    });
  }
  if (data.driverCountInRegion >= 50) {
    cards.push({
      value: `${data.driverCountInRegion}`,
      label: "drivers using CDLA.jobs nearby",
    });
  }
  if (data.recentHireCount > 0) {
    cards.push({
      value: `${data.recentHireCount}`,
      label: "hired through us in the last 30 days",
    });
  }

  return (
    <section className="mx-auto max-w-5xl px-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-xl border border-brand-rule bg-brand-paper p-5"
          >
            <div className="text-3xl font-semibold text-brand-deep tracking-tight">
              {c.value}
            </div>
            <div className="mt-2 text-sm leading-5 text-brand-muted">{c.label}</div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-sm leading-6 text-brand-muted">
        Numbers update live. We don&rsquo;t make this up. If a carrier is hiring,
        they&rsquo;re in our system. If they&rsquo;re not, we&rsquo;re not pretending.
      </p>
    </section>
  );
}

function HowItWorks({ parsed }: { parsed: ParsedSlug }) {
  const { regionInfo, equipmentInfo } = parsed;
  const steps = [
    {
      title: "Tell us once.",
      body: `Fill out our intake — takes about 6 minutes. CDL details, equipment you've run, what you want, the safety stuff carriers ask anyway. We ask it once. Carriers ask it on every application.`,
    },
    {
      title: "We match you.",
      body: `Our system runs your profile against every carrier hiring ${equipmentInfo.humanized} in ${regionInfo.displayName}. You see your matches in the portal. Pick the ones you want to share your info with. Ignore the ones you don't.`,
    },
    {
      title: "Carriers reach out.",
      body: `We send your info to the carriers you picked. Their recruiters contact you directly to start their hiring process. You complete their application — the background check stuff happens with them, not us. We get out of the way.`,
    },
  ];

  return (
    <section className="mx-auto max-w-5xl px-5">
      <h2 className="text-2xl font-semibold tracking-tight text-brand-ink">How it works</h2>
      <ol className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-5">
        {steps.map((s, i) => (
          <li
            key={s.title}
            className="rounded-xl border border-brand-rule bg-brand-paper p-5"
          >
            <div className="text-sm font-medium text-brand-medium">Step {i + 1}</div>
            <div className="mt-2 text-lg font-semibold text-brand-ink">{s.title}</div>
            <p className="mt-2 text-base leading-7 text-brand-muted">{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Pay({ parsed, data }: Props) {
  const { regionInfo, equipmentInfo } = parsed;
  const low = data.payLow!.toLocaleString();
  const high = data.payHigh!.toLocaleString();
  const median = data.payMedian?.toLocaleString();

  return (
    <section className="mx-auto max-w-3xl px-5">
      <h2 className="text-2xl font-semibold tracking-tight text-brand-ink">
        What {equipmentInfo.displayName.toLowerCase()} drivers earn in {regionInfo.displayName}
      </h2>
      <p className="mt-4 text-base leading-7 text-brand-ink">
        Carriers in our system hiring {equipmentInfo.humanized} in {regionInfo.displayName} are paying weekly rates between ${low} and ${high}.
        {median ? ` The middle of that range is around $${median}.` : ""}
      </p>
      <p className="mt-3 text-base leading-7 text-brand-muted">
        Pay depends on experience, equipment-specific endorsements, lanes, and home time preferences. The drivers earning the top of the range usually have 5+ years experience, the endorsements the position requires, and flexibility on home time.
      </p>
      <p className="mt-4 rounded-lg border-l-4 border-brand-gold bg-brand-surface p-4 text-base leading-7 text-brand-ink">
        If a carrier in our system won&rsquo;t tell us what they pay, we won&rsquo;t show them to you. Period. That&rsquo;s not how we work.
      </p>
    </section>
  );
}

function FAQ({ parsed }: { parsed: ParsedSlug }) {
  const items = [...STANDARD_FAQ];

  if (parsed.equipment === "hazmat") {
    items.push({
      q: "Do I need my hazmat endorsement?",
      a: `If you're targeting hazmat jobs — yes. If you have it, we'll prioritize matches that require it. If you don't, we'll show you non-hazmat options in ${parsed.regionInfo.displayName}.`,
    });
  }
  if (["miami", "houston", "i95-corridor", "gulf-coast"].includes(parsed.region) || parsed.equipment === "intermodal") {
    items.push({
      q: "Does a TWIC card help?",
      a: `It does for port work, container jobs, and intermodal in ${parsed.regionInfo.displayName}. Tell us in your intake whether you have it. If you don't, we won't match you to TWIC-required positions.`,
    });
  }

  return (
    <section className="mx-auto max-w-3xl px-5">
      <h2 className="text-2xl font-semibold tracking-tight text-brand-ink">FAQ</h2>
      <div className="mt-6 divide-y divide-brand-rule rounded-xl border border-brand-rule bg-brand-paper">
        {items.map((item) => (
          <details key={item.q} className="group p-5">
            <summary className="flex cursor-pointer list-none items-center justify-between text-base font-medium text-brand-ink">
              <span>{item.q}</span>
              <span className="ml-3 text-brand-muted group-open:rotate-45 transition-transform">+</span>
            </summary>
            <p className="mt-3 text-base leading-7 text-brand-muted">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function FinalCTA({ parsed, data }: Props) {
  const { regionInfo } = parsed;
  return (
    <section className="mx-auto max-w-3xl px-5">
      <div className="rounded-xl bg-brand-deep p-7 sm:p-10 text-brand-paper">
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
          Six minutes from here to seeing your matches.
        </h2>
        <p className="mt-4 text-base leading-7 text-brand-paper/85">
          No commitment. No selling your info. No spam afterward. If you decide CDLA.jobs
          isn&rsquo;t for you, you delete your account and we delete your data. That&rsquo;s it.
        </p>
        <div className="mt-6">
          <a
            href="/intake"
            className="inline-flex h-14 items-center justify-center rounded-md bg-brand-gold px-7 text-base font-semibold text-brand-ink hover:bg-brand-gold/90 transition-colors"
          >
            Find my matches
          </a>
        </div>
        {data.driverCountInRegion >= 50 && (
          <p className="mt-5 text-sm text-brand-paper/75">
            {data.driverCountInRegion} drivers near {regionInfo.displayName} have used CDLA.jobs.
          </p>
        )}
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="mx-auto w-full max-w-5xl px-5 pt-8 border-t border-brand-rule">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-sm text-brand-muted">
        <div className="font-semibold text-brand-deep">CDLA.jobs</div>
        <nav className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/" className="hover:text-brand-ink">For Drivers</Link>
          <Link href="/carriers" className="hover:text-brand-ink">For Carriers</Link>
          <Link href="/about" className="hover:text-brand-ink">About</Link>
          <Link href="/contact" className="hover:text-brand-ink">Contact</Link>
          <Link href="/privacy" className="hover:text-brand-ink">Privacy</Link>
          <Link href="/terms" className="hover:text-brand-ink">Terms</Link>
        </nav>
      </div>
      <p className="mt-4 text-xs leading-5 text-brand-muted">
        CDLA.jobs sends email about job matches. To stop receiving messages, click any
        unsubscribe link in our email or reply STOP to any text.
      </p>
    </footer>
  );
}
