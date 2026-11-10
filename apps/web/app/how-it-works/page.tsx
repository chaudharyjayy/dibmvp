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
      "Age, weight, sex — the only three inputs the model needs. No names, no medical notes, no photos, nothing else stored.",
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
      "The simulation engine is open-source and framework-free: the one-compartment model and standard two-compartment math, with a documented unit-test suite.",
  },
  {
    n: "02",
    title: "Interactions, only from a verified list",
    body:
      "Pairs outside the list are labelled as exactly that — not in our small verified set — instead of being guessed.",
  },
  {
    n: "03",
    title: "Your data stays yours",
    body:
      "Reports saved to your account can be deleted one by one, or everything at once, with a single call.",
  },
];

export default function HowItWorksPage() {
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

      <div className="relative z-10 mx-auto max-w-5xl px-5 py-16 sm:px-8 sm:py-24">
        <p className="text-xs font-medium uppercase tracking-[0.28em] text-white/45">
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
        <p className="mt-5 max-w-xl text-sm font-light leading-7 text-white/60 sm:text-base">
          Nothing is invented to fill a gap. Where a value is unknown, the
          interface says so.
        </p>

        <ol className="mt-12 grid gap-4 sm:mt-16 sm:grid-cols-3">
          {steps.map((s) => (
            <li key={s.n} className="liquid-glass rounded-[1.75rem] p-6 sm:p-7">
              <span className="text-xs font-light tabular-nums text-white/40">
                {s.n}
              </span>
              <h2 className="mt-4 text-lg font-medium">{s.title}</h2>
              <p className="mt-2 text-sm font-light leading-6 text-white/60">
                {s.body}
              </p>
            </li>
          ))}
        </ol>

        <h2 className="mt-20 text-2xl font-normal sm:text-3xl" style={{ letterSpacing: "-0.03em" }}>
          What keeps it honest
        </h2>
        <div className="mt-6 divide-y divide-white/10 border-y border-white/10">
          {bullets.map((b) => (
            <div key={b.n} className="flex flex-col gap-2 py-6 sm:flex-row sm:gap-8">
              <span className="w-10 shrink-0 text-xs font-light tabular-nums text-white/35">
                {b.n}
              </span>
              <div>
                <h3 className="text-base font-medium sm:text-lg">{b.title}</h3>
                <p className="mt-2 max-w-2xl text-sm font-light leading-6 text-white/55">
                  {b.body}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-16 flex flex-wrap items-center gap-6">
          <Link
            href="/simulator"
            className="liquid-glass inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-medium text-white transition duration-300 hover:bg-white/10"
          >
            Open the simulator
            <ArrowUpRight className="h-4 w-4" strokeWidth={1.5} />
          </Link>
          <p className="text-xs font-light text-white/40">
            Educational simulator only — not medical advice.
          </p>
        </div>
      </div>
    </main>
  );
}
