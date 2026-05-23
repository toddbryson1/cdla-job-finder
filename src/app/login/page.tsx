import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Sign in to CDLA.jobs",
  description: "Enter your email and we'll send you a sign-in link.",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
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
        <LoginForm />
      </div>
    </main>
  );
}
