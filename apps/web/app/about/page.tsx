import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About us — Drug-in-Body",
  description:
    "An educational simulator that makes drug concentration over time visible — no invented values, and no advice.",
};

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-white text-zinc-900">
      <section className="p-8">
        <heading>heading</heading>
        <p>this is a paragraph</p>
        <heading>heading</heading>
        <p>this is a paragraph</p>
        <heading>heading</heading>
        <p>this is a paragraph</p>
        <heading>heading</heading>
        <p>this is a paragraph</p>
        <div className="mt-8">
          <Link
            href="/simulator"
            className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-8 py-3 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(0,0,0,0.08)] transition hover:bg-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
          >
            heading
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    </main>
  );
}