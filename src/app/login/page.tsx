import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Sign in to CDLA.jobs",
  description: "Enter your email and we'll send you a sign-in link.",
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ auth?: string }>;
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
  const { auth } = await searchParams;
  const message = authMessage(auth);

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
        <LoginForm />
      </div>
    </main>
  );
}
