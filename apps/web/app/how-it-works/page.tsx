import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, CircleUserRound } from "lucide-react";

export const metadata: Metadata = {
  title: "How does this work — Drug-in-Body",
  description:
    "Three steps: describe yourself, set doses and timing, read the concentration curve. An educational simulator, not advice.",
};

const steps = [
  {
    n: "01",
    title: "Describe yourself minimally",
    body:
      "Age, weight and sex are the only inputs the model uses. No names, no medical notes, no photos. If you sign in, those three numbers are stored so the form is pre-filled, and any report you save is kept in your account.",
  },
  {
    n: "02",
    title: "Set doses and timing",
    body:
      "Enter dose amounts and the times you took them on a timeline you control. The engine steps through it in the order it happened.",
  },
  {
    n: "03",
    title: "Read the curve",
    body:
      "The engine simulates concentration over time with standard compartment models and produces a plain-language report you can save to your account.",
  },
];

const bullets = [
  {
    n: "01",
    title: "Standard models, no folklore",
    body:
      "The simulation engine is open-source and framework-free: the one-compartment model with first-order absorption, a closed-form check on the same maths, and a documented unit-test suite. The two-compartment model is not implemented yet.",
  },
  {
    n: "02",
    title: "Interactions are never guessed",
    body:
      "No verified interaction list is in the dataset yet. When one exists, a pair outside it will be labelled “Not in our small verified set” — never presented as safe.",
  },
  {
    n: "03",
    title: "Your data stays yours",
    body:
      "The data layer can delete one saved report or all of them. The screen for that is not built yet. Nothing is shared, and no profile or report contents are logged.",
  },
];

export default function HowItWorksPage() {
  return (
    <main className="min-h-screen bg-white text-zinc-900">
      <div className="pointer-events-none fixed -left-40 top-[-10%] h-[420px] w-[420px] rounded-full bg-emerald-200/30 blur-[150px]" />
      <div className="pointer-events-none fixed -right-32 bottom-[-10%] h-[380px] w-[380px] rounded-full bg-sky-200/30 blur-[150px]" />

      <header className="relative z-10 flex items-center justify-between px-5 pt-6 sm:px-8 md:px-12 lg:px-16">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-zinc-500 transition hover:text-zinc-900"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
          Home
        </Link>
        <Link
          href="/signin"
          aria-label="Account"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white shadow-sm transition hover:border-zinc-300"
        >
          <CircleUserRound className="h-5 w-5 text-zinc-700" strokeWidth={1.5} />
        </Link>
      </header>

      <div className="relative z-10 mx-auto max-w-5xl px-5 py-16 sm:px-8 sm:py-24">
        <p className="text-xs font-medium uppercase tracking-[0.28em] text-zinc-400">
          How does this work
        </p>
        <h1
          className="mt-5 max-w-2xl text-4xl font-normal leading-[1.05] sm:text-5xl md:text-6xl"
          style={{ letterSpacing: "-0.05em" }}
        >
          Three steps.
          <br />
          One honest engine.
        </h1>
        <p className="mt-5 max-w-xl text-sm font-light leading-7 text-zinc-600 sm:text-base">
          Nothing is invented to fill a gap. Where a value is unknown, the
          interface says so.
        </p>

        <ol className="mt-12 grid gap-4 sm:mt-16 sm:grid-cols-3">
          {steps.map((s) => (
            <li
              key={s.n}
              className="rounded-[1.75rem] border border-zinc-200 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-7"
            >
              <span className="text-xs font-medium tabular-nums text-zinc-400">
                {s.n}
              </span>
              <h2 className="mt-4 text-lg font-medium">{s.title}</h2>
              <p className="mt-2 text-sm font-light leading-6 text-zinc-600">
                {s.body}
              </p>
            </li>
          ))}
        </ol>

        <h2
          className="mt-20 text-2xl font-normal sm:text-3xl"
          style={{ letterSpacing: "-0.03em" }}
        >
          What keeps it honest
        </h2>
        <div className="mt-6 divide-y divide-zinc-200 border-y border-zinc-200">
          {bullets.map((b) => (
            <div key={b.n} className="flex flex-col gap-2 py-6 sm:flex-row sm:gap-8">
              <span className="w-10 shrink-0 text-xs font-medium tabular-nums text-zinc-400">
                {b.n}
              </span>
              <div>
                <h3 className="text-base font-medium sm:text-lg">{b.title}</h3>
                <p className="mt-2 max-w-2xl text-sm font-light leading-6 text-zinc-600">
                  {b.body}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-16 flex flex-wrap items-center gap-6">
          <Link
            href="/simulator"
            className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-7 py-3.5 text-sm font-medium text-white transition duration-300 hover:bg-zinc-700"
          >
            Open the simulator
            <ArrowUpRight className="h-4 w-4" strokeWidth={1.5} />
          </Link>
        </div>
      </div>
    </main>
  );
}
