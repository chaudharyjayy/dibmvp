"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useEffect } from "react";

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

export default function ScrollSections() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.setAttribute("data-visible", "true"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.setAttribute("data-visible", "true");
            io.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.15 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="relative z-10 -mt-px overflow-x-clip rounded-t-[2rem] border-t border-white/10 bg-[#070707] text-white shadow-[0_-60px_140px_rgba(0,0,0,0.85)] sm:rounded-t-[3rem]">
      {/* Ambient layers */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-40 top-40 h-[420px] w-[420px] rounded-full bg-emerald-400/10 blur-[140px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-32 top-[55%] h-[380px] w-[380px] rounded-full bg-sky-400/10 blur-[150px]"
      />

      {/* ---------------- Our Approach ---------------- */}
      <section
        id="approach"
        className="relative mx-auto max-w-6xl scroll-mt-16 px-5 py-20 sm:px-8 sm:py-28 md:px-16 lg:px-20"
      >
        <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
          <div className="lg:sticky lg:top-24 lg:self-start" data-reveal>
            <p className="text-xs font-medium uppercase tracking-[0.28em] text-white/45">
              Our Approach
            </p>
            <h2
              className="mt-5 text-3xl font-normal leading-[1.08] sm:text-4xl md:text-5xl"
              style={{ letterSpacing: "-0.04em" }}
            >
              Built on models,
              <br />
              not guesswork.
            </h2>
            <p className="mt-5 max-w-sm text-sm font-light leading-6 text-white/60 sm:text-base">
              Three steps, one honest engine. Nothing is invented to fill a gap —
              where a value is unknown, the interface says so.
            </p>
            <Link
              href="/simulator"
              className="group mt-7 inline-flex items-center gap-2 text-sm font-medium text-white/80 transition hover:text-white"
            >
              Open the simulator
              <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </Link>
          </div>

          <ol className="space-y-4 sm:space-y-5">
            {steps.map((s, i) => (
              <li
                key={s.n}
                data-reveal
                style={{ transitionDelay: `${i * 90}ms` }}
                className="liquid-glass rounded-[1.75rem] p-6 sm:p-8"
              >
                <div className="flex items-start gap-5">
                  <span className="mt-0.5 text-xs font-light tabular-nums text-white/40">
                    {s.n}
                  </span>
                  <div>
                    <h3 className="text-base font-medium sm:text-lg">{s.title}</h3>
                    <p className="mt-2 text-sm font-light leading-6 text-white/55">
                      {s.body}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------------- Healing Methods — sticky stack ---------------- */}
      <section
        id="methods"
        className="relative border-t border-white/10 py-20 sm:py-28"
      >
        <div className="mx-auto max-w-6xl px-5 sm:px-8 md:px-16 lg:px-20">
          <div className="max-w-2xl" data-reveal>
            <p className="text-xs font-medium uppercase tracking-[0.28em] text-white/45">
              Healing Methods
            </p>
            <h2
              className="mt-5 text-3xl font-normal leading-[1.08] sm:text-4xl md:text-5xl"
              style={{ letterSpacing: "-0.04em" }}
            >
              Three layers, one
              <br />
              honest model.
            </h2>
            <p className="mt-5 text-sm font-light leading-6 text-white/60 sm:text-base">
              Scroll on — each layer settles over the last, the way the real
              system stacks up.
            </p>
          </div>

          <div className="mt-12 space-y-6 sm:mt-16">
            {bullets.map((b, i) => (
              <div
                key={b.n}
                className={`sticky ${i < bullets.length - 1 ? "mb-[10vh]" : ""}`}
                style={{ top: `${5.5 + i * 1.25}rem`, zIndex: i + 1 }}
              >
                <article
                  data-reveal
                  style={{ transitionDelay: `${i * 70}ms` }}
                  className="liquid-glass rounded-[2rem] bg-[#0b0b0b]/80 p-7 backdrop-blur-2xl sm:p-10"
                >
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                    <div className="max-w-xl">
                      <h3 className="text-xl font-medium sm:text-2xl">{b.title}</h3>
                      <p className="mt-3 text-sm font-light leading-6 text-white/55 sm:text-base">
                        {b.body}
                      </p>
                    </div>
                    <span className="shrink-0 text-4xl font-light leading-none text-white/15 sm:text-6xl">
                      {b.n}
                    </span>
                  </div>
                </article>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- Closing CTA ---------------- */}
      <section className="relative border-t border-white/10 px-5 py-24 text-center sm:px-8 sm:py-32 md:px-16">
        <div data-reveal className="mx-auto max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.28em] text-white/45">
            Start here
          </p>
          <h2
            className="mt-6 text-4xl font-normal leading-[1.05] sm:text-5xl md:text-6xl"
            style={{ letterSpacing: "-0.05em" }}
          >
            See the curve,
            <br />
            not just the dose.
          </h2>
          <p className="mx-auto mt-5 max-w-md text-sm font-light leading-6 text-white/60 sm:text-base">
            Runs on labelled placeholder parameters until real values are sourced.
            No invented pharmacology, ever.
          </p>
          <Link
            href="/simulator"
            className="liquid-glass mt-8 inline-block rounded-full px-7 py-3.5 text-sm font-medium text-white transition duration-300 hover:bg-white/10"
          >
            Begin Your Journey
          </Link>
        </div>
      </section>

      {/* ---------------- Footer ---------------- */}
      <footer className="relative border-t border-white/10 px-5 py-10 sm:px-8 md:px-16 lg:px-20">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 text-xs leading-6 text-white/40 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-xl">
            <p>
              This tool is a simulation for information purposes only and is not
              medical advice. It does not diagnose, treat, or recommend anything.
              Pair it with real information: a pharmacist or your prescriber.
            </p>
            <p className="mt-2">
              Drug-in-Body Simulator · open-source engine · report data deletable
              at any time
            </p>
          </div>
          <nav className="flex items-center gap-5">
            <Link href="/simulator" className="transition hover:text-white/80">
              Simulator
            </Link>
            <Link href="/signin" className="transition hover:text-white/80">
              Sign in
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
