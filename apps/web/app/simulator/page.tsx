import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CircleUserRound } from "lucide-react";
import Simulator from "@/components/simulator/simulator";

export const metadata: Metadata = {
  title: "Simulator — Drug-in-Body",
  description:
    "Enter doses and timing, see the simulated concentration curve. Runs on labelled placeholder parameters.",
};

export default function SimulatorPage() {
  return (
    <main className="min-h-screen flex-1 bg-[#070707] text-white">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-light text-white/60 transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
            Back
          </Link>
          <Link
            href="/signin"
            aria-label="Account"
            className="liquid-glass flex h-10 w-10 items-center justify-center rounded-full"
          >
            <CircleUserRound className="h-5 w-5 text-white/80" strokeWidth={1.5} />
          </Link>
        </div>
      </header>
      <div className="dark">
        <Simulator />
      </div>
    </main>
  );
}
