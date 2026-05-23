import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { carrierJobs, carriers, drivers } from "@/db/schema";
import { getSessionState } from "@/lib/stytch/session";
import { qualifyDriverForCarrier } from "@/lib/matching";
import { submitConsent, submitSwiftConfirmation } from "./actions";
import { STAGE_2_CONSENT_TEXT_VERSION } from "./constants";
import { QuestionsForm } from "./QuestionsForm";

// TODO: add step-up verification before Stage 2 consent
// (attorney addendum Q10 — magic-link session is "limited"; a step-up SMS
// OTP gate belongs in front of this screen before sensitive submissions.)

export const metadata: Metadata = {
  title: "Apply to this carrier",
  description: "Consent, a few safety questions, and your application link.",
  robots: { index: false, follow: false },
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Step = "consent" | "questions" | "result";

interface PageProps {
  params: Promise<{ driverId: string; jobId: string }>;
  searchParams: Promise<{ step?: string; swift?: string }>;
}

export default async function ApplyPage({ params, searchParams }: PageProps) {
  const { driverId, jobId } = await params;
  const sp = await searchParams;
  const step: Step =
    sp.step === "questions" || sp.step === "result" ? sp.step : "consent";

  if (!UUID_RE.test(driverId) || !UUID_RE.test(jobId)) {
    redirect("/login");
  }

  const session = await getSessionState();
  if (session.kind !== "ok") {
    redirect(
      `/login?redirect=${encodeURIComponent(`/match/${driverId}/${jobId}/apply`)}`,
    );
  }

  const driver = await db.query.drivers.findFirst({
    where: eq(drivers.id, driverId),
  });
  if (!driver) {
    return <NotFound />;
  }
  if (driver.email.toLowerCase() !== session.email) {
    return <WrongDriverForSession />;
  }

  const job = await db.query.carrierJobs.findFirst({
    where: eq(carrierJobs.id, jobId),
  });
  if (!job) {
    return <JobNotFound driverId={driverId} />;
  }

  const carrier = await db.query.carriers.findFirst({
    where: eq(carriers.id, job.carrierId),
  });
  if (!carrier) {
    return <JobNotFound driverId={driverId} />;
  }

  const consentForThisCarrier =
    driver.stage2ConsentAt != null &&
    driver.stage2ConsentCarrierId === job.carrierId;

  // Guard: can't reach questions or result without consent for this carrier.
  if ((step === "questions" || step === "result") && !consentForThisCarrier) {
    redirect(`/match/${driverId}/${jobId}/apply?step=consent`);
  }

  return (
    <Shell>
      <StepHeader driverId={driverId} step={step} />
      {step === "consent" ? (
        <ConsentScreen
          driverId={driverId}
          jobId={jobId}
          carrierName={carrier.name}
        />
      ) : null}
      {step === "questions" ? (
        <QuestionsScreen
          driverId={driverId}
          jobId={jobId}
          carrierName={carrier.name}
        />
      ) : null}
      {step === "result" ? (
        <ResultScreen
          driverId={driverId}
          jobId={jobId}
          carrierName={carrier.name}
          job={job}
          driver={driver}
          swiftSubmitted={sp.swift === "submitted"}
        />
      ) : null}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-brand-surface">
      <div className="mx-auto max-w-2xl px-5 py-10 sm:py-14">
        <div className="rounded-2xl border border-brand-rule bg-white p-6 shadow-sm sm:p-10">
          {children}
        </div>
      </div>
    </main>
  );
}

function StepHeader({ driverId, step }: { driverId: string; step: Step }) {
  const stepNum = step === "consent" ? 1 : step === "questions" ? 2 : 3;
  return (
    <div className="mb-6 flex items-center justify-between gap-3">
      <p className="text-xs font-medium uppercase tracking-wide text-brand-medium">
        Step {stepNum} of 3
      </p>
      <Link
        href={`/matches/${driverId}`}
        className="text-xs font-medium text-brand-muted hover:text-brand-ink"
      >
        Back to matches
      </Link>
    </div>
  );
}

function ConsentScreen({
  driverId,
  jobId,
  carrierName,
}: {
  driverId: string;
  jobId: string;
  carrierName: string;
}) {
  const action = submitConsent.bind(null, driverId, jobId);
  return (
    <>
      <p className="text-sm font-medium text-brand-medium">CDLA.jobs</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-brand-ink sm:text-3xl">
        Before we send anything to {carrierName}
      </h1>
      <p className="mt-3 text-base leading-7 text-brand-ink">
        Read this once. It&rsquo;s the actual authorization the carrier and our
        referral partner need before your info moves.
      </p>

      <form action={action} className="mt-8 space-y-8">
        <ConsentBlock carrierName={carrierName} />

        <div className="rounded-lg border border-brand-rule bg-brand-surface p-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="tcpa"
              defaultChecked={false}
              className="mt-1 h-5 w-5 rounded border-brand-rule text-brand-deep focus:ring-brand-medium"
            />
            <span className="text-sm leading-6 text-brand-ink">
              <span className="font-semibold">Optional:</span> I agree that
              CDLA.jobs, PHTP, and <span className="font-semibold">{carrierName}</span>{" "}
              may contact me at the phone number I provided about this carrier
              opportunity, IntelliApp completion, application reminders,
              recruiting follow-up, and related services by call or text message,
              including calls or texts made using automated dialing or messaging
              technology and artificial or prerecorded voice messages.
              <br />
              <br />
              I understand my consent is not required to submit my information,
              be matched, or pursue this carrier opportunity. Message and data
              rates may apply. Message frequency may vary. I may revoke consent
              at any time by replying STOP to texts or by any reasonable method.
            </span>
          </label>
        </div>

        <input
          type="hidden"
          name="consent_version"
          value={STAGE_2_CONSENT_TEXT_VERSION}
        />

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="inline-flex h-11 items-center justify-center rounded-md bg-brand-deep px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-medium"
          >
            I Agree — Continue to Questions
          </button>
          <Link
            href={`/matches/${driverId}`}
            className="text-xs font-medium text-brand-muted hover:text-brand-ink"
          >
            Not now
          </Link>
        </div>
      </form>
    </>
  );
}

function ConsentBlock({ carrierName }: { carrierName: string }) {
  return (
    <section className="rounded-lg border border-brand-rule bg-white p-5 text-sm leading-6 text-brand-ink">
      <h2 className="text-base font-semibold text-brand-ink">
        Carrier Submission Authorization
      </h2>
      <p className="mt-3">
        You selected <span className="font-semibold">{carrierName}</span> as a
        carrier you may want to pursue.
      </p>
      <p className="mt-3">
        By clicking <span className="font-semibold">Submit to Carrier</span>, you
        authorize <span className="font-semibold">CDLA.jobs</span> to send your
        driver intake and prequalification information to{" "}
        <span className="font-semibold">PHTP</span>, CDLA.jobs&rsquo; referral
        partner, through <span className="font-semibold">PHTP&rsquo;s Tenstreet account</span>,
        so that PHTP may route or make your information available to{" "}
        <span className="font-semibold">{carrierName}</span> for recruiting,
        prequalification, application review, IntelliApp completion, and related
        hiring steps.
      </p>
      <p className="mt-3">
        The information shared may include your name, contact information, CDL
        information, endorsements, work history, equipment experience, safety
        history, job preferences, resume or parsed resume data, and other
        information you provided during intake.
      </p>
      <p className="mt-3">
        CDLA.jobs is a matching and referral service. Submitting your
        information does not guarantee a job offer, interview, qualification,
        or hire. <span className="font-semibold">{carrierName}</span> makes its
        own hiring decisions and may request additional application materials,
        background checks, employment verification, drug/alcohol history, MVR,
        PSP, DAC, or other reviews.
      </p>
      <p className="mt-3">
        If you do not want your information sent to PHTP and{" "}
        <span className="font-semibold">{carrierName}</span>, do not click{" "}
        <span className="font-semibold">Submit to Carrier</span>.
      </p>

      <hr className="my-5 border-brand-rule" />

      <p>
        I also authorize CDLA.jobs, PHTP, and{" "}
        <span className="font-semibold">{carrierName}</span> to contact me by
        live phone call, email, or other non-automated communication regarding
        this carrier opportunity, my application, missing information,
        IntelliApp completion, or next steps.
      </p>
      <p className="mt-3">
        If I do not complete the carrier application in the initial session,
        CDLA.jobs, PHTP, or <span className="font-semibold">{carrierName}</span>{" "}
        may send follow-up reminders for approximately 3 days to help me
        complete the application or next step.
      </p>
    </section>
  );
}

function QuestionsScreen({
  driverId,
  jobId,
  carrierName,
}: {
  driverId: string;
  jobId: string;
  carrierName: string;
}) {
  return (
    <>
      <p className="text-sm font-medium text-brand-medium">CDLA.jobs</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-brand-ink sm:text-3xl">
        A few questions about your record
      </h1>
      <div className="mt-6">
        <QuestionsForm
          driverId={driverId}
          jobId={jobId}
          carrierName={carrierName}
        />
      </div>
    </>
  );
}

async function ResultScreen({
  driverId,
  jobId,
  carrierName,
  job,
  driver,
  swiftSubmitted,
}: {
  driverId: string;
  jobId: string;
  carrierName: string;
  job: typeof carrierJobs.$inferSelect;
  driver: typeof drivers.$inferSelect;
  swiftSubmitted: boolean;
}) {
  // Re-run qualification from stored Stage 2 fields. The questions step
  // persisted these before redirecting here, so they should be populated.
  const stage2 = {
    tickets3yrCount: driver.tickets3yrCount ?? 0,
    accidents3yrCount: driver.accidents3yrCount ?? 0,
    accidents3yrAtFaultCount: driver.accidents3yrAtFaultCount ?? 0,
    duiEver: driver.duiEver === true,
    duiMostRecentDate: driver.duiMostRecentDate
      ? new Date(`${driver.duiMostRecentDate}T00:00:00Z`)
      : null,
    felonyEver: driver.felonyEver === true,
  };

  const result = await qualifyDriverForCarrier(driverId, jobId, stage2);

  if (result.qualifies) {
    return (
      <Qualified
        driverId={driverId}
        jobId={jobId}
        carrierName={carrierName}
        job={job}
        swiftSubmitted={swiftSubmitted}
      />
    );
  }
  return (
    <NotQualified
      driverId={driverId}
      carrierName={carrierName}
      reasons={result.reasons}
    />
  );
}

function isSwiftTwoStep(job: typeof carrierJobs.$inferSelect): boolean {
  if (job.applicationSurface !== "tenstreet_intelliapp") return false;
  return Boolean(job.applicationUrl && job.applicationUrl.includes("swiftcompthird"));
}

function Qualified({
  driverId,
  jobId,
  carrierName,
  job,
  swiftSubmitted,
}: {
  driverId: string;
  jobId: string;
  carrierName: string;
  job: typeof carrierJobs.$inferSelect;
  swiftSubmitted: boolean;
}) {
  return (
    <>
      <p className="text-sm font-medium text-brand-medium">CDLA.jobs</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-brand-ink sm:text-3xl">
        You qualify for this position.
      </h1>
      <p className="mt-3 text-base leading-7 text-brand-ink">
        Here&rsquo;s how to apply to{" "}
        <span className="font-semibold">{carrierName}</span>.
      </p>

      <div className="mt-6">
        {job.applicationSurface === "tenstreet_intelliapp" &&
        isSwiftTwoStep(job) ? (
          <SwiftHandoff
            driverId={driverId}
            jobId={jobId}
            job={job}
            swiftSubmitted={swiftSubmitted}
          />
        ) : null}

        {job.applicationSurface === "tenstreet_intelliapp" &&
        !isSwiftTwoStep(job) ? (
          <StandardIntelliApp job={job} />
        ) : null}

        {job.applicationSurface === "email_only" ? (
          <EmailOnly carrierName={carrierName} />
        ) : null}

        {job.applicationSurface === "phone_only" ? (
          <PhoneOnly carrierName={carrierName} job={job} />
        ) : null}

        {job.applicationSurface === "custom_intake_form" ||
        job.applicationSurface === "unknown" ? (
          <FallbackHandoff carrierName={carrierName} job={job} />
        ) : null}
      </div>

      <div className="mt-10">
        <Link
          href={`/matches/${driverId}`}
          className="inline-flex h-11 items-center justify-center rounded-md border border-brand-rule px-5 text-sm font-medium text-brand-ink hover:bg-brand-surface"
        >
          Back to matches
        </Link>
      </div>
    </>
  );
}

function SwiftHandoff({
  driverId,
  jobId,
  job,
  swiftSubmitted,
}: {
  driverId: string;
  jobId: string;
  job: typeof carrierJobs.$inferSelect;
  swiftSubmitted: boolean;
}) {
  const action = submitSwiftConfirmation.bind(null, driverId, jobId);
  return (
    <section className="space-y-5">
      <div className="rounded-lg border border-brand-rule bg-brand-surface p-5">
        <p className="text-sm font-semibold text-brand-ink">Step 1</p>
        <p className="mt-2 text-sm leading-6 text-brand-ink">
          Complete your application using the link below. When you reach the
          recruiter question, select <span className="font-semibold">Matt Hutto</span>.
        </p>
        {job.applicationUrl ? (
          <a
            href={job.applicationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex h-11 items-center justify-center rounded-md bg-brand-deep px-5 text-sm font-semibold text-white shadow-sm hover:bg-brand-medium"
          >
            Complete Step 1 application
          </a>
        ) : null}
      </div>

      <div className="rounded-lg border border-brand-rule p-5">
        <p className="text-sm font-semibold text-brand-ink">Step 2</p>
        <p className="mt-2 text-sm leading-6 text-brand-ink">
          After you finish Step 1, you&rsquo;ll receive a confirmation number.
          Come back here and enter it to get your Step 2 link.
        </p>
        {swiftSubmitted ? (
          <p className="mt-4 rounded-md border border-brand-rule bg-brand-surface p-3 text-sm text-brand-ink">
            Got it — Step 2 link coming. We&rsquo;ll email it to you.
          </p>
        ) : (
          <form action={action} className="mt-4 flex flex-wrap items-center gap-3">
            <label htmlFor="swift-conf" className="sr-only">
              Confirmation number
            </label>
            <input
              id="swift-conf"
              name="confirmation"
              type="text"
              required
              maxLength={40}
              placeholder="Confirmation number"
              className="h-11 min-w-56 rounded-md border border-brand-rule bg-white px-3 text-sm text-brand-ink focus:border-brand-medium focus:outline-none focus:ring-2 focus:ring-brand-medium/30"
            />
            <button
              type="submit"
              className="inline-flex h-11 items-center justify-center rounded-md bg-brand-deep px-5 text-sm font-semibold text-white hover:bg-brand-medium"
            >
              Submit
            </button>
          </form>
        )}
      </div>
    </section>
  );
}

function StandardIntelliApp({
  job,
}: {
  job: typeof carrierJobs.$inferSelect;
}) {
  return (
    <section>
      <div className="rounded-lg border border-brand-rule bg-brand-surface p-5">
        <p className="text-sm font-semibold text-brand-ink">
          Before you start, make sure you have:
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 text-brand-ink">
          <li>Your full job history for the past 10 years (including non-driving jobs)</li>
          <li>2 references</li>
        </ul>
        <p className="mt-4 text-sm leading-6 text-brand-ink">
          When the application asks how you heard about this position, select{" "}
          <span className="font-semibold">Other</span> and type the source
          identifier provided by your recruiter.
        </p>
      </div>

      {job.applicationUrl ? (
        <a
          href={job.applicationUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex h-11 items-center justify-center rounded-md bg-brand-deep px-5 text-sm font-semibold text-white shadow-sm hover:bg-brand-medium"
        >
          Complete your application
        </a>
      ) : null}
    </section>
  );
}

function EmailOnly({ carrierName }: { carrierName: string }) {
  return (
    <section className="rounded-lg border border-brand-rule bg-brand-surface p-5">
      <p className="text-sm leading-6 text-brand-ink">
        We&rsquo;ve sent your information to{" "}
        <span className="font-semibold">{carrierName}</span>. Expect to hear
        from them within 1&ndash;2 business days.
      </p>
    </section>
  );
}

function PhoneOnly({
  carrierName,
  job,
}: {
  carrierName: string;
  job: typeof carrierJobs.$inferSelect;
}) {
  return (
    <section className="rounded-lg border border-brand-rule bg-brand-surface p-5">
      <p className="text-sm leading-6 text-brand-ink">
        Call <span className="font-semibold">{carrierName}</span>
        {job.applicationPhone ? (
          <>
            {" "}at{" "}
            <a
              href={`tel:${job.applicationPhone}`}
              className="font-semibold underline"
            >
              {job.applicationPhone}
            </a>
          </>
        ) : null}{" "}
        to complete your application. Let them know you came through CDLA.jobs.
      </p>
    </section>
  );
}

function FallbackHandoff({
  carrierName,
  job,
}: {
  carrierName: string;
  job: typeof carrierJobs.$inferSelect;
}) {
  return (
    <section className="rounded-lg border border-brand-rule bg-brand-surface p-5">
      <p className="text-sm leading-6 text-brand-ink">
        We&rsquo;ll hand your info to{" "}
        <span className="font-semibold">{carrierName}</span> directly. A
        recruiter will reach out about next steps.
      </p>
      {job.applicationUrl ? (
        <a
          href={job.applicationUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex h-11 items-center justify-center rounded-md border border-brand-rule bg-white px-5 text-sm font-medium text-brand-ink hover:bg-white"
        >
          Open the carrier&rsquo;s site
        </a>
      ) : null}
    </section>
  );
}

function NotQualified({
  driverId,
  carrierName,
  reasons,
}: {
  driverId: string;
  carrierName: string;
  reasons: string[];
}) {
  const timeBased = reasons.includes("dui_too_recent");
  return (
    <>
      <p className="text-sm font-medium text-brand-medium">CDLA.jobs</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-brand-ink sm:text-3xl">
        Not a match for {carrierName} right now
      </h1>
      {timeBased ? (
        <p className="mt-4 text-base leading-7 text-brand-ink">
          <span className="font-semibold">{carrierName}&rsquo;s</span>{" "}
          requirements aren&rsquo;t a match right now, but requirements like
          this are time-based — things can open up. We&rsquo;ll keep you in the
          system and re-match as your situation changes.
        </p>
      ) : (
        <p className="mt-4 text-base leading-7 text-brand-ink">
          <span className="font-semibold">{carrierName}</span> has specific
          requirements that don&rsquo;t match your current profile — but
          that&rsquo;s one carrier. Carrier requirements vary widely, and your
          matches page has other options that may be a better fit right now.
        </p>
      )}
      <div className="mt-8">
        <Link
          href={`/matches/${driverId}`}
          className="inline-flex h-11 items-center justify-center rounded-md bg-brand-deep px-5 text-sm font-semibold text-white shadow-sm hover:bg-brand-medium"
        >
          Back to my matches
        </Link>
      </div>
    </>
  );
}

function NotFound() {
  return (
    <Shell>
      <p className="text-sm font-medium text-brand-medium">CDLA.jobs</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-brand-ink sm:text-3xl">
        We could not find that profile.
      </h1>
      <p className="mt-3 text-base leading-7 text-brand-ink">
        The link you used does not match any driver in our system.
      </p>
    </Shell>
  );
}

function WrongDriverForSession() {
  return (
    <Shell>
      <p className="text-sm font-medium text-brand-medium">CDLA.jobs</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-brand-ink sm:text-3xl">
        That is not your profile.
      </h1>
      <p className="mt-3 text-base leading-7 text-brand-ink">
        You are signed in, but the link points to someone else&rsquo;s
        application. Sign in with the email you used at intake.
      </p>
      <div className="mt-6">
        <Link
          href="/login"
          className="inline-flex h-11 items-center justify-center rounded-md bg-brand-deep px-5 text-sm font-semibold text-white hover:bg-brand-medium"
        >
          Sign in with the right email
        </Link>
      </div>
    </Shell>
  );
}

function JobNotFound({ driverId }: { driverId: string }) {
  return (
    <Shell>
      <p className="text-sm font-medium text-brand-medium">CDLA.jobs</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-brand-ink sm:text-3xl">
        We could not find that job.
      </h1>
      <p className="mt-3 text-base leading-7 text-brand-ink">
        It may have been pulled by the carrier.
      </p>
      <div className="mt-6">
        <Link
          href={`/matches/${driverId}`}
          className="inline-flex h-11 items-center justify-center rounded-md border border-brand-rule px-5 text-sm font-medium text-brand-ink hover:bg-brand-surface"
        >
          Back to your matches
        </Link>
      </div>
    </Shell>
  );
}
