import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, CircleUserRound } from "lucide-react";

export const metadata: Metadata = {
  title: "About us — Drug-in-Body",
  description:
    "An educational simulator that makes drug concentration over time visible — with sourced parameters, no invented values, and no advice.",
};

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-[#070707] text-white">
      <div className="pointer-events-none fixed -left-40 top-[-10%] h-[420px] w-[420px] rounded-full bg-emerald-400/10 blur-[150px]" />
      <div className="pointer-events-none fixed -right-32 bottom-[-10%] h-[380px] w-[380px] rounded-full bg-sky-400/10 blur-[150px]" />

      <header className="relative z-10 flex items-center justify-between px-5 pt-6 sm:px-8 md:px-16 lg:px-20">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-light text-white/60 transition hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
          Home
        </Link>
        <Link
          href="/signin"
          aria-label="Account"
          className="liquid-glass flex h-10 w-10 items-center justify-center rounded-full"
        >
          <CircleUserRound className="h-5 w-5 text-white/80" strokeWidth={1.5} />
        </Link>
      </header>

      <div className="relative z-10 mx-auto max-w-4xl px-5 py-16 sm:px-8 sm:py-24">
        <p className="text-xs font-medium uppercase tracking-[0.28em] text-white/45">
          About us
        </p>
        <h1
          className="mt-5 max-w-2xl text-4xl font-normal leading-[1.05] sm:text-5xl md:text-6xl"
          style={{ letterSpacing: "-0.05em" }}
        >
          Make concentration
          <br />
          visible.
        </h1>

        <div className="mt-8 max-w-2xl space-y-5 text-sm font-light leading-7 text-white/60 sm:text-base">
          <p>
            A dose is easy to see. What it becomes in the body is not. This
            project exists to draw that second part: the rise and fall of a drug
            in the body over time, using standard pharmacokinetic models on the
            numbers you enter.
          </p>
          <p>
            It is intentionally small. A handful of drugs, a short verified
            interaction list, one clear curve. Where a value has not been sourced
            from a published dataset or an official label, it stays blank and the
            interface says so — nothing is invented to make a screen look full.
          </p>
          <p>
            The engine is open-source and framework-free with a documented test
            suite. The report text is checked for banned wording and every number
            in it has to come from the simulation input.
          </p>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-2">
          <div className="liquid-glass rounded-[1.75rem] p-6 sm:p-7">
            <h2 className="text-sm font-medium text-emerald-300/90">Stored</h2>
            <ul className="mt-3 space-y-2 text-sm font-light leading-6 text-white/60">
              <li>Your simulation numbers: age, weight, sex</li>
              <li>Drugs, doses and times you entered</li>
              <li>The resulting metrics and report text</li>
            </ul>
          </div>
          <div className="liquid-glass rounded-[1.75rem] p-6 sm:p-7">
            <h2 className="text-sm font-medium text-rose-300/90">Never stored</h2>
            <ul className="mt-3 space-y-2 text-sm font-light leading-6 text-white/60">
              <li>Names, or emails beyond the sign-in id</li>
              <li>Free-text medical notes</li>
              <li>Photos, locations, contacts</li>
            </ul>
          </div>
        </div>

        <div className="mt-14 rounded-[1.75rem] border border-white/10 p-6 sm:p-8">
          <h2 className="text-base font-medium">The one-line version</h2>
          <p className="mt-3 max-w-2xl text-sm font-light leading-7 text-white/55">
            This is a simulation for information purposes only and is not medical
            advice. It does not diagnose, treat, or recommend anything. Pair it
            with real information: a pharmacist or your prescriber.
          </p>
        </div>

        <div className="mt-12 flex flex-wrap items-center gap-6">
          <Link
            href="/simulator"
            className="liquid-glass inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-medium text-white transition duration-300 hover:bg-white/10"
          >
            Open the simulator
            <ArrowUpRight className="h-4 w-4" strokeWidth={1.5} />
          </Link>
          <Link
            href="/how-it-works"
            className="text-sm font-light text-white/60 transition hover:text-white"
          >
            How does this work
          </Link>
        </div>
      </div>
    </main>
  );
}
