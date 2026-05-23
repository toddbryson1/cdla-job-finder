import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Get back to your matches",
  description: "Enter your email and we'll send you a sign-in link.",
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ redirect?: string }>;
}

export default async function LoginPage({ searchParams }: PageProps) {
  const { redirect } = await searchParams;
  const safeRedirect =
    redirect && redirect.startsWith("/") ? redirect : "/";

  return (
    <main className="min-h-screen bg-brand-surface">
      <div className="mx-auto max-w-md px-5 py-12 sm:py-20">
        <header className="mb-8">
          <p className="text-sm font-medium text-brand-medium">CDLA.jobs</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-brand-ink">
            Get back to your matches.
          </h1>
          <p className="mt-3 text-base leading-7 text-brand-muted">
            Enter the email you used when you applied and we will send you a
            link.
          </p>
        </header>
        <LoginForm redirect={safeRedirect} />
      </div>
    </main>
  );
}
