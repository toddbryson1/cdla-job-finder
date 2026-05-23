import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Check your email",
  description: "We sent you a link to your matches.",
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ email?: string; link?: string }>;
}

export default async function IntakeDonePage({ searchParams }: PageProps) {
  const { email, link } = await searchParams;
  const sent = link === "1";

  return (
    <main className="min-h-screen bg-brand-surface">
      <div className="mx-auto max-w-2xl px-5 py-16 sm:py-24">
        <div className="rounded-2xl border border-brand-rule bg-white p-8 sm:p-10 shadow-sm">
          <p className="text-sm font-medium text-brand-medium">CDLA.jobs</p>
          {sent ? (
            <>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-brand-ink">
                Check your email.
              </h1>
              <p className="mt-4 text-base leading-7 text-brand-ink">
                We sent a link to{" "}
                {email ? (
                  <span className="font-medium">{email}</span>
                ) : (
                  "the email you provided"
                )}
                . Click it to see the carriers we matched you with. The link
                expires in 15 minutes — open it on this device.
              </p>
              <p className="mt-3 text-sm text-brand-muted">
                Didn&rsquo;t arrive? Check spam. If you used a different email
                during intake, head to{" "}
                <Link
                  href="/login"
                  className="font-medium text-brand-medium underline"
                >
                  login
                </Link>{" "}
                and try that one.
              </p>
            </>
          ) : (
            <>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-brand-ink">
                You&rsquo;re in.
              </h1>
              <p className="mt-4 text-base leading-7 text-brand-ink">
                Your profile is saved. To see your matches, head to{" "}
                <Link
                  href="/login"
                  className="font-medium text-brand-medium underline"
                >
                  login
                </Link>{" "}
                and use the email you just signed up with — we&rsquo;ll send
                you a link.
              </p>
            </>
          )}
          <div className="mt-6 rounded-lg bg-brand-surface p-4 text-sm leading-6 text-brand-muted">
            <p className="font-medium text-brand-ink">What happens next</p>
            <ol className="mt-2 list-decimal pl-5 space-y-1.5">
              <li>You open the link and see your matches.</li>
              <li>You pick the carriers you want to share your info with.</li>
              <li>Their recruiters reach out to start their hiring process.</li>
              <li>You complete their application with them &mdash; not us.</li>
            </ol>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/"
              className="inline-flex h-11 items-center justify-center rounded-md border border-brand-rule px-5 text-sm font-medium text-brand-ink hover:bg-brand-surface"
            >
              Back to home
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
