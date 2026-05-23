import type { Metadata } from "next";
import Link from "next/link";
import { redirect as nextRedirect } from "next/navigation";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { drivers } from "@/db/schema";
import {
  getStytchClient,
  isStytchConfigured,
  SESSION_COOKIE,
  SESSION_IDLE_MINUTES,
  SESSION_ABSOLUTE_SECONDS,
} from "@/lib/stytch/client";

export const metadata: Metadata = {
  title: "Signing you in",
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{
    token?: string;
    stytch_token_type?: string;
  }>;
}

export default async function AuthenticatePage({ searchParams }: PageProps) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <FailureShell
        title="That link is missing something."
        body="The sign-in link does not include a token. Try requesting a new one."
        retryHref="/login"
      />
    );
  }

  if (!isStytchConfigured()) {
    return (
      <FailureShell
        title="Sign-in is not configured yet."
        body="The site does not have Stytch credentials set. Set STYTCH_PROJECT_ID and STYTCH_SECRET in .env.local."
        retryHref="/login"
      />
    );
  }

  let verifiedEmail: string | null = null;
  try {
    const result = await getStytchClient().magicLinks.authenticate({
      token,
      session_duration_minutes: SESSION_IDLE_MINUTES,
    });

    if (!result.session_token) {
      throw new Error("authenticate returned no session_token");
    }

    const verified =
      result.user.emails.find((e) => e.verified) ?? result.user.emails[0];
    verifiedEmail = verified?.email?.toLowerCase() ?? null;

    const store = await cookies();
    store.set(SESSION_COOKIE, result.session_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_ABSOLUTE_SECONDS,
    });
  } catch (err) {
    console.error("[authenticate] stytch authenticate failed:", err);
    return (
      <FailureShell
        title="That link did not work."
        body="It may have expired, already been used, or been clicked on a different device. Request a new one and we'll send it again."
        retryHref="/login"
      />
    );
  }

  // Route by looking the driver up by verified email. No `?redirect=` query
  // param on the magic link (Stytch dashboard URL validation rejects it);
  // we infer the destination from who just authenticated.
  if (verifiedEmail) {
    const driver = await db.query.drivers.findFirst({
      where: eq(drivers.email, verifiedEmail),
      columns: { id: true },
    });
    if (driver) {
      nextRedirect(`/matches/${driver.id}`);
    }
  }
  nextRedirect("/");
}

function FailureShell({
  title,
  body,
  retryHref,
}: {
  title: string;
  body: string;
  retryHref: string;
}) {
  return (
    <main className="min-h-screen bg-brand-surface">
      <div className="mx-auto max-w-md px-5 py-12 sm:py-20">
        <header className="mb-6">
          <p className="text-sm font-medium text-brand-medium">CDLA.jobs</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-brand-ink">
            {title}
          </h1>
          <p className="mt-3 text-base leading-7 text-brand-ink">{body}</p>
        </header>
        <Link
          href={retryHref}
          className="inline-flex h-11 items-center justify-center rounded-md bg-brand-deep px-5 text-sm font-semibold text-white hover:bg-brand-medium transition-colors"
        >
          Send me a new link
        </Link>
      </div>
    </main>
  );
}
