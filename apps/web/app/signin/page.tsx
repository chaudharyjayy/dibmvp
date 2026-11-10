import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import AuthPanel from "../AuthPanel";

export const metadata: Metadata = {
  title: "Sign in — Drug-in-Body",
  description:
    "Sign in with an email link to save simulation reports to your account.",
};

export default function SignInPage() {
  return (
    <main className="relative flex min-h-screen flex-1 flex-col overflow-hidden bg-black text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-32 top-[-10%] h-[420px] w-[420px] rounded-full bg-emerald-400/10 blur-[140px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 bottom-[-10%] h-[380px] w-[380px] rounded-full bg-sky-400/10 blur-[150px]"
      />

      <header className="relative z-10 px-5 pt-6 sm:px-8 md:px-16 lg:px-20">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-light text-white/60 transition hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
          Back
        </Link>
      </header>

      <div className="relative z-10 flex flex-1 items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-md">
          <p className="text-xs font-medium uppercase tracking-[0.28em] text-white/45">
            Account
          </p>
          <h1
            className="mt-4 text-3xl font-normal sm:text-4xl"
            style={{ letterSpacing: "-0.04em" }}
          >
            Save your reports
          </h1>
          <p className="mt-3 text-sm font-light leading-6 text-white/60">
            Sign in with a one-time email link. No password, no profile content
            beyond the three numbers the model uses.
          </p>

          <div className="dark mt-8">
            <AuthPanel />
          </div>

          <p className="mt-6 text-[11px] leading-5 text-white/35">
            Educational simulator only — not medical advice. Reports can be
            deleted at any time.
          </p>
        </div>
      </div>
    </main>
  );
}
