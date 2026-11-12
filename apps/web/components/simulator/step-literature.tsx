"use client";

/**
 * The literature strip: three published papers about the process a
 * walkthrough step narrates, fetched from PubMed.
 *
 * What it is not: model output, advice, or a claim that the model simulates
 * any of it. The heading says where it comes from and the caption says what
 * it is for — context for the reader, nothing more.
 *
 * It fetches the first time the strip scrolls into view, so walking the body
 * does not fire a request per step up front. While it loads it holds a
 * one-line skeleton; if PubMed is unreachable it says so quietly and the
 * step reads fine without it.
 */

import { useEffect, useRef, useState } from "react";
import { articleMetaLine, articleUrl, type LiteratureArticle, type LiteratureTopic } from "@/lib/pubmed";

export type StepLiteratureProps = {
  topic: LiteratureTopic;
};

type Strip =
  | { state: "idle" | "loading" }
  | { state: "done"; articles: LiteratureArticle[] }
  | { state: "error" };

export default function StepLiterature({ topic }: StepLiteratureProps) {
  const [strip, setStrip] = useState<Strip>({ state: "idle" });
  /** Fetches once per instance; re-entries must not re-request. */
  const startedRef = useRef(false);
  /** The strip element, observed so the fetch fires when the reader arrives. */
  const asideRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const aside = asideRef.current;
    if (!aside) return;
    /** Runs on unmount: marks an in-flight fetch as ignorable. */
    const cleanupFns: Array<() => void> = [];
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        if (startedRef.current) return;
        startedRef.current = true;
        observer.disconnect();
        let cancelled = false;
        setStrip({ state: "loading" });
        fetch(`/api/literature?topic=${topic}`)
          .then((response) => response.json())
          .then((data: { articles?: LiteratureArticle[]; error?: string | null }) => {
            if (cancelled) return;
            if (data.error || !Array.isArray(data.articles)) {
              setStrip({ state: "error" });
              return;
            }
            setStrip({ state: "done", articles: data.articles });
          })
          .catch(() => {
            if (!cancelled) setStrip({ state: "error" });
          });
        cleanupFns.push(() => {
          cancelled = true;
        });
      },
      // A strip loads a little before the reader reaches it: the fetch has
      // usually settled by the time the papers are on screen.
      { rootMargin: "0px 0px 15% 0px", threshold: 0.1 },
    );
    observer.observe(aside);
    return () => {
      observer.disconnect();
      for (const fn of cleanupFns) fn();
    };
  }, [topic]);

  /** The articles, once loaded — null while idle, loading or errored. */
  const articles = strip.state === "done" ? strip.articles : null;

  return (
    <aside
      ref={asideRef}
      className="mt-5 max-w-[46ch] rounded-[8px] border border-line bg-surface/50 px-3 py-2.5"
      aria-label="Published research about this process"
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
        From the literature · PubMed
      </p>

      {strip.state === "idle" || strip.state === "loading" ? (
        <p className="mt-1.5 text-[12px] leading-4 text-ink-3" aria-live="polite">
          Looking up published papers…
        </p>
      ) : strip.state === "error" ? (
        <p className="mt-1.5 text-[12px] leading-4 text-ink-3">
          PubMed is not reachable right now. The step above runs without it.
        </p>
      ) : articles && articles.length === 0 ? (
        <p className="mt-1.5 text-[12px] leading-4 text-ink-3">
          No suitable review turned up for this topic.
        </p>
      ) : articles ? (
        <ul className="mt-1.5 space-y-1.5">
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
              <span className="ml-1.5 font-mono text-[11px] text-ink-3">
                {articleMetaLine(article)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-1.5 text-[11px] leading-4 text-ink-3">
        Published research about this process — context, not the model&rsquo;s output and not
        advice.
      </p>
    </aside>
  );
}
