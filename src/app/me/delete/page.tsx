// /me/delete — CCPA right-to-delete confirmation page.
//
// Authenticated driver lands here from the link in /me's footer.
// Renders a clear "this is what we'll do" explainer with the
// permanent-action warning, then a form that POSTs to
// deleteMyData (server action in ./actions.ts).
//
// After submit: the action anonymizes the row + clears cookies +
// redirects to /me/delete?done=1, which renders a confirmation
// page (no auth required since cookies are gone).
//
// We don't cascade-delete the driver's applications / matches /
// partner_application_stages rows because that would retroactively
// rewrite the funnel metrics on /admin. Anonymizing the driver row
// breaks the identity link, which is what regulators ask for
// ("erasure" satisfied by inability to re-identify).

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { drivers } from "@/db/schema";
import { getSessionState } from "@/lib/stytch/session";
import { DeleteConfirmForm } from "./DeleteConfirmForm";

export const metadata: Metadata = {
  title: "Delete my data — CDLA.jobs",
  robots: { index: false, follow: false },
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  searchParams: Promise<{ done?: string }>;
}

export default async function DeleteMyDataPage({ searchParams }: PageProps) {
  const { done } = await searchParams;

  if (done === "1") {
    // Post-delete success state. Auth check is skipped — the action
    // already cleared the cookies and the driver row is now
    // anonymized, so the normal auth would either fail or report
    // "no driver." Renders unconditionally.
    return <PostDelete />;
  }

  // Pre-confirmation: must be authenticated. Same two-path auth as
  // /me itself.
  if (!(await isAuthenticated())) {
    redirect("/login?redirect=/me/delete");
  }

  return (
    <main className="min-h-screen bg-brand-surface">
      <div className="mx-auto max-w-2xl px-5 py-10 sm:py-14">
        <header className="mb-8">
          <p className="text-sm font-medium text-brand-medium">CDLA.jobs</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-brand-ink sm:text-4xl">
            Delete my data
          </h1>
          <p className="mt-3 text-base leading-7 text-brand-muted">
            CCPA / GDPR right to delete. Once you confirm, here&rsquo;s
            exactly what happens.
          </p>
        </header>

        <section className="rounded-2xl border border-brand-rule bg-brand-paper p-6 shadow-sm sm:p-8">
          <h2 className="text-base font-semibold text-brand-ink">
            What gets deleted right now
          </h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-6 text-brand-ink">
            <li>Your name, email, phone, and mailing address</li>
            <li>Your home zip code</li>
            <li>Your access to log back in (we won&rsquo;t recognize you)</li>
          </ul>

          <h2 className="mt-6 text-base font-semibold text-brand-ink">
            What we keep — and why
          </h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-6 text-brand-ink">
            <li>
              Anonymized records of carriers you applied to. We don&rsquo;t
              know it&rsquo;s you anymore, but the carrier may have already
              acted on your application before this moment.
            </li>
            <li>
              Aggregate funnel statistics (counts only, no identifying
              fields). Same idea — we already calculated them.
            </li>
          </ul>

          <p className="mt-5 text-sm leading-6 text-brand-muted">
            This is permanent. We won&rsquo;t be able to restore your
            profile, matches, or application history if you change your
            mind. If you&rsquo;d rather just stop the emails,{" "}
            <Link
              href="/me"
              className="font-medium text-brand-medium underline-offset-2 hover:underline"
            >
              go back to /me
            </Link>{" "}
            and use the unsubscribe link in any CDLA.jobs email instead.
          </p>

          <div className="mt-8">
            <DeleteConfirmForm />
          </div>
        </section>
      </div>
    </main>
  );
}

function PostDelete() {
  return (
    <main className="min-h-screen bg-brand-paper">
      <div className="mx-auto max-w-2xl px-5 py-16 sm:py-24">
        <p className="inline-flex items-center gap-2.5 text-[13px] font-semibold uppercase tracking-[0.12em] text-brand-medium">
          <span
            aria-hidden="true"
            className="inline-block h-px w-6 bg-brand-gold"
          />
          CDLA.jobs
        </p>
        <h1 className="mt-5 text-4xl font-bold leading-[1.04] tracking-[-0.03em] text-brand-ink">
          Your data has been deleted.
        </h1>
        <p className="mt-4 text-lg leading-[1.5] text-brand-ink">
          Your name, email, phone, address, and home zip are gone from our
          records. You&rsquo;re also signed out.
        </p>
        <p className="mt-4 text-base leading-7 text-brand-muted">
          If you ever want to look at carriers again, you&rsquo;re welcome
          to start fresh at CDLA.jobs as a brand-new driver. Nothing
          carries over.
        </p>
        <div className="mt-8">
          <Link
            href="/"
            className="inline-flex h-11 items-center justify-center rounded-md bg-brand-deep px-6 text-sm font-semibold text-brand-paper shadow-sm hover:bg-brand-medium"
          >
            Back to CDLA.jobs
          </Link>
        </div>
      </div>
    </main>
  );
}

/** Same auth resolution as /me. */
async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const cookieDriverId = cookieStore.get("cdla_driver_id")?.value;
  if (cookieDriverId && UUID_RE.test(cookieDriverId)) {
    const row = await db.query.drivers.findFirst({
      where: eq(drivers.id, cookieDriverId),
      columns: { id: true, deletedAt: true },
    });
    if (row && row.deletedAt == null) return true;
  }
  const session = await getSessionState();
  if (session.kind !== "ok") return false;
  const row = await db.query.drivers.findFirst({
    where: eq(drivers.email, session.email),
    columns: { id: true, deletedAt: true },
  });
  return row != null && row.deletedAt == null;
}
