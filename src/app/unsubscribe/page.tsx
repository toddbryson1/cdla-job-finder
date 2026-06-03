// /unsubscribe?did=...&t=... — CAN-SPAM unsubscribe landing.
// Reached by clicking the footer link in any CDLA.jobs email.
//
// Single GET = unsubscribed. No confirmation click required —
// federal law (15 USC § 7704(a)(4)(A)) requires opt-out be honored
// without forcing the recipient to provide more information beyond
// the email address (and we already know who they are from the
// token). A confirmation click adds friction that drives complaints
// to ESPs.
//
// HMAC token over driver UUID + UNSUBSCRIBE_SECRET means:
//   - Anyone with the link can unsubscribe that driver
//   - But the link is unguessable without the secret
//   - That's the right tradeoff: legitimate email recipients (and
//     their family / coworkers reading over their shoulder) can
//     unsubscribe; randos hitting /unsubscribe with guessed UUIDs
//     can't.
//
// Idempotent — clicking twice doesn't error, just reports the same
// "you're unsubscribed" state.

import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { drivers } from "@/db/schema";
import { verifyUnsubscribeToken } from "@/lib/email/unsubscribe";

export const metadata: Metadata = {
  title: "Unsubscribe from CDLA.jobs",
  robots: { index: false, follow: false },
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  searchParams: Promise<{ did?: string; t?: string }>;
}

type Outcome =
  | { kind: "ok"; email: string | null; alreadyDone: boolean }
  | { kind: "bad_link" };

export default async function UnsubscribePage({ searchParams }: PageProps) {
  const { did, t } = await searchParams;
  const outcome: Outcome = await processUnsubscribe(did, t);

  return (
    <main className="min-h-screen bg-brand-paper">
      <div className="mx-auto max-w-xl px-5 py-16 sm:py-24">
        <p className="inline-flex items-center gap-2.5 text-[13px] font-semibold uppercase tracking-[0.12em] text-brand-medium">
          <span
            aria-hidden="true"
            className="inline-block h-px w-6 bg-brand-gold"
          />
          CDLA.jobs
        </p>
        {outcome.kind === "ok" ? (
          <Confirmed
            email={outcome.email}
            alreadyDone={outcome.alreadyDone}
          />
        ) : (
          <BadLink />
        )}
      </div>
    </main>
  );
}

async function processUnsubscribe(
  did: string | undefined,
  token: string | undefined,
): Promise<Outcome> {
  if (!did || !UUID_RE.test(did) || !token) {
    return { kind: "bad_link" };
  }
  if (!verifyUnsubscribeToken(did, token)) {
    return { kind: "bad_link" };
  }

  // Even after a valid HMAC, double-check the driver exists. Catches
  // the case of a driver row being cascade-deleted between when the
  // email was sent and when the link was clicked.
  const driver = await db.query.drivers.findFirst({
    where: eq(drivers.id, did),
    columns: { id: true, email: true, unsubscribedAt: true },
  });
  if (!driver) {
    return { kind: "bad_link" };
  }

  const alreadyDone = driver.unsubscribedAt != null;
  if (!alreadyDone) {
    await db
      .update(drivers)
      .set({ unsubscribedAt: new Date() })
      .where(eq(drivers.id, did));
  }
  return { kind: "ok", email: driver.email, alreadyDone };
}

function Confirmed({
  email,
  alreadyDone,
}: {
  email: string | null;
  alreadyDone: boolean;
}) {
  return (
    <>
      <h1 className="mt-5 text-4xl font-bold leading-[1.04] tracking-[-0.03em] text-brand-ink">
        {alreadyDone ? "You’re already off the list." : "You’re unsubscribed."}
      </h1>
      <p className="mt-4 text-lg leading-[1.5] text-brand-ink">
        We won&rsquo;t send any more CDLA.jobs emails to{" "}
        <span className="font-semibold">
          {email ?? "this address"}
        </span>
        .
      </p>
      <p className="mt-4 text-base leading-7 text-brand-muted">
        Your profile and your existing applications stay where they are
        — this just stops the emails. If you change your mind later,
        the easiest thing is to sign back in at CDLA.jobs and let
        us know.
      </p>
      <div className="mt-8">
        <Link
          href="/"
          className="inline-flex h-11 items-center justify-center rounded-md border border-brand-rule bg-brand-paper px-6 text-sm font-medium text-brand-ink hover:bg-brand-surface"
        >
          Back to CDLA.jobs
        </Link>
      </div>
    </>
  );
}

function BadLink() {
  return (
    <>
      <h1 className="mt-5 text-4xl font-bold leading-[1.04] tracking-[-0.03em] text-brand-ink">
        That link didn&rsquo;t work.
      </h1>
      <p className="mt-4 text-lg leading-[1.5] text-brand-ink">
        The unsubscribe link may have been copied wrong or expired. To
        stop emails, sign in and let us know directly.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Link
          href="/login"
          className="inline-flex h-11 items-center justify-center rounded-md bg-brand-deep px-6 text-sm font-semibold text-brand-paper shadow-sm hover:bg-brand-medium"
        >
          Sign in
        </Link>
        <Link
          href="/"
          className="inline-flex h-11 items-center justify-center rounded-md border border-brand-rule px-6 text-sm font-medium text-brand-ink hover:bg-brand-surface"
        >
          Back home
        </Link>
      </div>
    </>
  );
}
