import type { Metadata } from "next";
import { redirect as redirectNav } from "next/navigation";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { LoginForm } from "./LoginForm";
import { getSessionState } from "@/lib/stytch/session";
import { db } from "@/db/client";
import { drivers } from "@/db/schema";

export const metadata: Metadata = {
  title: "Sign in to CDLA.jobs",
  description: "Enter your email and we'll send you a sign-in link.",
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ auth?: string; redirect?: string }>;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Only allow same-origin paths through the redirect param to avoid
 *  open-redirect via /login?redirect=https://evil.example. */
function safeRedirectPath(raw: string | undefined): string | null {
  if (!raw) return null;
  if (raw.length > 200) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//")) return null; // protocol-relative
  return raw;
}

function authMessage(reason: string | undefined): string | null {
  if (!reason) return null;
  switch (reason) {
    case "missing_token":
      return "That sign-in link was missing its token. Send yourself a new one.";
    case "not_configured":
      return "Sign-in isn't configured on this server yet.";
    case "no_session":
      return "We could not start a session for that link. Try a new one.";
    case "unknown":
      return "That sign-in link didn't work. Send a new one.";
    default:
      return `That sign-in link didn't work (${reason}). Send a new one.`;
  }
}

export default async function LoginPage({ searchParams }: PageProps) {
  const { auth, redirect } = await searchParams;
  const message = authMessage(auth);
  const redirectAfter = safeRedirectPath(redirect);

  // Already-signed-in short-circuit. Save the driver a round-trip
  // (form → magic link → second email → click → land here):
  //   1. Anonymous-intake cookie matches a real driver row → /me
  //      (or the redirect target, if same-origin)
  //   2. Stytch session present + email matches a driver → same
  // Only fires when auth message is absent — if they're coming back
  // from a failed magic-link click we want them to see the form,
  // not silently bounce off into the same broken state.
  if (!message) {
    const target = redirectAfter ?? "/me";
    const cookieStore = await cookies();
    const cookieDriverId = cookieStore.get("cdla_driver_id")?.value;
    if (cookieDriverId && UUID_RE.test(cookieDriverId)) {
      const row = await db.query.drivers.findFirst({
        where: eq(drivers.id, cookieDriverId),
        columns: { id: true },
      });
      if (row) redirectNav(target);
    }

    const session = await getSessionState();
    if (session.kind === "ok") {
      const driver = await db.query.drivers.findFirst({
        where: eq(drivers.email, session.email),
        columns: { id: true },
      });
      if (driver) redirectNav(target);
    }
  }

  return (
    <main className="min-h-screen bg-brand-surface">
      <div className="mx-auto max-w-md px-5 py-12 sm:py-20">
        <header className="mb-8">
          <p className="text-sm font-medium text-brand-medium">CDLA.jobs</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-brand-ink">
            Sign in.
          </h1>
          <p className="mt-3 text-base leading-7 text-brand-muted">
            Enter the email you used at intake and we&rsquo;ll send you a link
            straight to your matches.
          </p>
        </header>
        {message ? (
          <div className="mb-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {message}
          </div>
        ) : null}
        <LoginForm redirectAfter={redirectAfter} />
      </div>
    </main>
  );
}
