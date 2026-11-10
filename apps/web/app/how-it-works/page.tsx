import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "How does this work — Drug-in-Body",
  description:
    "Three steps: describe yourself, set doses and timing, read the concentration curve. An educational simulator, not advice.",
};

export default function HowItWorksPage() {
  return (
    <main className="min-h-screen bg-white text-zinc-900">
      <section className="p-8">
        <ol className="space-y-4">
          <li>
            <heading>heading</heading>
            <p>this is a paragraph</p>
          </li>
          <li>
            <heading>heading</heading>
            <p>this is a paragraph</p>
          </li>
          <li>
            <heading>heading</heading>
            <p>this is a paragraph</p>
          </li>
        </ol>
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