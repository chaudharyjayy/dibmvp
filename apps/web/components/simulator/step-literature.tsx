"use client";

/**
 * The literature strip: published papers about the process a walkthrough
 * step narrates, fetched from PubMed.
 *
 * Two sections:
 * - the organ's process (the fixed topic query), and
 * - one section per medicine in the current treatment (up to three), the
 *   drug's name resolved from the catalogue server-side.
 *
 * What it is not: model output, advice, or a claim that the model simulates
 * any of it. The heading says where it comes from and the caption says what
 * it is for — context for the reader, nothing more.
 *
 * Each section fetches the first time the strip scrolls into view, so
 * walking the body does not fire a request per step up front. While it
 * loads it holds a one-line skeleton; if PubMed is unreachable it says so
 * quietly and the step reads fine without it.
 */

import { useEffect, useRef, useState } from "react";
import { articleMetaLine, articleUrl, type LiteratureArticle, type LiteratureTopic } from "@/lib/pubmed";

export type StepLiteratureProps = {
  topic: LiteratureTopic;
  /** The treatment's medicines, already capped by the console to five. */
  drugs?: Array<{ id: string; name: string }>;
};

type Section =
  | { state: "idle" | "loading" }
  | { state: "done"; articles: LiteratureArticle[] }
  | { state: "error" };

/** The organs' papers: at most three, like each drug section. */
function capArticles(articles: LiteratureArticle[], max: number): LiteratureArticle[] {
  return articles.slice(0, max);
}

export default function StepLiterature({ topic, drugs = [] }: StepLiteratureProps) {
  const [organSection, setOrganSection] = useState<Section>({ state: "idle" });
  const [drugSections, setDrugSections] = useState<Record<string, Section>>({});
  /** The strip element, observed so the fetches fire when the reader arrives. */
  const asideRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const aside = asideRef.current;
    if (!aside) return;
    // Fresh per effect run: a new topic or treatment refetches, and the
    // cleanup below marks this run's fetches as ignorable.
    let cancelled = false;
    let started = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting) || started) return;
        started = true;
        observer.disconnect();

        const fetchSection = (
          url: string,
          apply: (section: Section) => void,
        ) => {
          fetch(url)
            .then((response) => response.json())
            .then((data: { articles?: LiteratureArticle[]; error?: string | null }) => {
              if (cancelled) return;
              if (data.error || !Array.isArray(data.articles)) {
                apply({ state: "error" });
                return;
              }
              apply({ state: "done", articles: data.articles });
            })
            .catch(() => {
              if (!cancelled) apply({ state: "error" });
            });
        };

        setOrganSection({ state: "loading" });
        fetchSection(`/api/literature?topic=${topic}`, setOrganSection);

        // One section per medicine, at most three: the strip stays small.
        const shown = drugs.slice(0, 3);
        setDrugSections(Object.fromEntries(shown.map((d) => [d.id, { state: "loading" }])));
        for (const drug of shown) {
          fetchSection(
            `/api/literature?drugId=${encodeURIComponent(drug.id)}`,
            (section) => setDrugSections((prev) => ({ ...prev, [drug.id]: section })),
          );
        }
      },
      // A strip loads a little before the reader reaches it: the fetch has
      // usually settled by the time the papers are on screen.
      { rootMargin: "0px 0px 15% 0px", threshold: 0.1 },
    );
    observer.observe(aside);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [topic, drugs]);

  return (
    <aside
      ref={asideRef}
      className="mt-5 max-w-[46ch] rounded-[8px] border border-line bg-surface/50 px-3 py-2.5"
      aria-label="Published research about this process"
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
        From the literature · PubMed
      </p>

      <SectionBody section={organSection} emptyNote="No suitable review turned up for this topic." />

      {drugs.slice(0, 3).map((drug) => (
        <div key={drug.id} className="mt-2 border-t border-line/60 pt-1.5">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
            {drug.name}
          </p>
          <SectionBody
            section={drugSections[drug.id] ?? { state: "idle" }}
            emptyNote="No papers turned up for this medicine."
          />
        </div>
      ))}

      <p className="mt-1.5 text-[11px] leading-4 text-ink-3">
        Published research about this process — context, not the model&rsquo;s output and not
        advice.
      </p>
    </aside>
  );
}

function SectionBody({ section, emptyNote }: { section: Section; emptyNote: string }) {
  if (section.state === "error") {
    return (
      <p className="mt-1 text-[12px] leading-4 text-ink-3">
        PubMed is not reachable right now. The step above runs without it.
      </p>
    );
  }
  if (section.state !== "done") {
    return (
      <p className="mt-1 text-[12px] leading-4 text-ink-3" aria-live="polite">
        Looking up published papers…
      </p>
    );
  }
  const articles = capArticles(section.articles, 3);
  if (articles.length === 0) {
    return <p className="mt-1 text-[12px] leading-4 text-ink-3">{emptyNote}</p>;
  }
  return (
    <ul className="mt-1 space-y-1">
      {articles.map((article) => (
        <li key={article.pmid} className="text-[12px] leading-5">
          <a
            href={articleUrl(article.pmid)}
            target="_blank"
            rel="noreferrer noopener"
            className="text-ink-2 underline decoration-line-strong underline-offset-2 transition-colors duration-150 hover:text-brand-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none"
          >
            {article.title}
          </a>
          <span className="ml-1.5 font-mono text-[11px] text-ink-3">{articleMetaLine(article)}</span>
        </li>
      ))}
    </ul>
  );
}
