import Link from "next/link";
import MurmurationWordmark from "@/components/ui/murmuration-wordmark";
import AuthPanel from "./AuthPanel";

const steps = [
  {
    n: "1",
    title: "Describe yourself minimally",
    body:
      "Age, weight, sex — the only three inputs the model needs. No names, no medical notes, no photos, nothing else stored.",
  },
  {
    n: "2",
    title: "Set doses and timing",
    body:
      "Pick drugs from the small verified set, enter dose amounts and the times you took them, on a timeline you control.",
  },
  {
    n: "3",
    title: "Read the curve",
    body:
      "The engine simulates concentration over time with standard compartment models and produces a plain-language report you can save to your account.",
  },
];

const bullets = [
  {
    title: "Standard models, no folklore",
    body:
      "The simulation engine is open-source and framework-free: the one-compartment model and standard two-compartment math, with a documented unit-test suite.",
  },
  {
    title: "Interactions, only from a verified list",
    body:
      "Pairs outside the list are labelled as exactly that — not in our small verified set — instead of being guessed.",
  },
  {
    title: "Your data stays yours",
    body:
      "Reports saved to your account can be deleted one by one, or everything at once, with a single call.",
  },
];

export default function LandingPage() {
  return (
    <main className="flex-1">
      {/* Hero — the flock forms the brand while the copy and sign-in ride above */}
      <MurmurationWordmark
        word="dib"
        preset="paper"
        height="100svh"
        reeds
        interactive
      >
        <div className="flex h-full flex-col">
          <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
            <span className="text-sm font-semibold tracking-tight">
              Drug-in-Body Simulator
            </span>
            <nav className="flex items-center gap-6 text-sm text-zinc-500">
              <a href="#how" className="hover:text-zinc-900">
                How it works
              </a>
              <a href="#privacy" className="hover:text-zinc-900">
                Privacy
              </a>
            </nav>
          </header>

          <div className="mx-auto grid w-full max-w-5xl flex-1 content-center gap-10 px-6 pb-16 sm:grid-cols-2 sm:items-center">
            <div>
              <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-[1.1]">
                See the curve, not just the dose.
              </h1>
              <p className="mt-5 text-lg leading-8 text-zinc-600">
                Enter a dose and when you took it — the simulator draws how its
                concentration in the body rises and falls, using standard
                pharmacokinetic models on your own numbers.
              </p>
              <p className="mt-3 text-sm text-zinc-500">
                For information only — not a medical tool. Nothing here is advice.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
                <span className="rounded-full border border-zinc-400/40 px-3 py-1 text-zinc-600">
                  Runs entirely on your inputs
                </span>
                <span className="rounded-full border border-zinc-400/40 px-3 py-1 text-zinc-600">
                  Test suite on every rule
                </span>
              </div>
            </div>

            <div className="text-sm">
              <p className="mb-3 text-zinc-600">
                Create an account to save reports — sign in first, the simulator
                ships next.
              </p>
              <div data-interactive>
                <AuthPanel />
              </div>
            </div>
          </div>
        </div>
      </MurmurationWordmark>

      {/* How it works */}
      <section
        id="how"
        className="border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950"
      >
        <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            How it works
          </h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            {steps.map((s) => (
              <div
                key={s.n}
                className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6"
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600/10 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                  {s.n}
                </span>
                <h3 className="mt-4 font-medium">{s.title}</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                  {s.body}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {bullets.map((b) => (
              <div key={b.title}>
                <h3 className="text-sm font-medium">{b.title}</h3>
                <p className="mt-1 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                  {b.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Privacy */}
      <section id="privacy" className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-8 sm:p-10">
          <h2 className="text-2xl font-semibold tracking-tight">
            What is stored — and what is not
          </h2>
          <div className="mt-6 grid gap-6 text-sm leading-6 sm:grid-cols-2">
            <div>
              <h3 className="font-medium text-emerald-700 dark:text-emerald-400">Stored</h3>
              <ul className="mt-2 list-disc list-inside text-zinc-500 dark:text-zinc-400 space-y-1">
                <li>Your simulation numbers: age, weight, sex</li>
                <li>Drugs, doses and times you entered</li>
                <li>The resulting metrics and report text</li>
              </ul>
            </div>
            <div>
              <h3 className="font-medium text-rose-600 dark:text-rose-400">Never stored</h3>
              <ul className="mt-2 list-disc list-inside text-zinc-500 dark:text-zinc-400 space-y-1">
                <li>Names, emails beyond the sign-in id</li>
                <li>Free-text medical notes</li>
                <li>Photos, locations, contacts</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-5xl px-6 py-8 text-xs leading-6 text-zinc-400">
          <p>
            This tool is a simulation for information purposes only and is not
            medical advice. It does not diagnose, treat, or recommend anything.
            Pair it with real information: a pharmacist or your prescriber.
          </p>
          <p className="mt-2">
            <Link href="/" className="underline hover:text-zinc-600">
              Drug-in-Body Simulator
            </Link>{" "}
            · open-source engine · report data deletable at any time ·{" "}
            <Link href="/demo" className="underline hover:text-zinc-600">
              murmuration preview
            </Link>
          </p>
        </div>
      </footer>
    </main>
  );
}
