"use client";

/**
 * The kidney report: a what-if on the model's total clearance, shown against
 * the cited baseline, with published context beside it.
 *
 * The comparison table is built from two engine runs of the same medicine and
 * dose schedule. The papers are labelled as context and never supply a number
 * to the model. The live PubMed strip below uses the same topic query and
 * caption as the walkthrough.
 */

import {
  KIDNEY_CONTEXT_LABEL,
  KIDNEY_PAPERS,
  kidneyPaperUrl,
} from "@/lib/kidney-evidence";
import {
  compareRuns,
  SCENARIO_CONTEXT,
  scenarioById,
  type ClearanceScenarioId,
} from "@/lib/kidney-scenario";
import type { MedicationRun } from "@/lib/treatment";
import StepLiterature from "./step-literature";

type KidneyReportProps = {
  scenario: ClearanceScenarioId;
  runs: MedicationRun[] | null;
  /** The treatment's medicines, for the live per-medicine literature sections. */
  drugs: Array<{ id: string; name: string }>;
};

export default function KidneyReport({ scenario, runs, drugs }: KidneyReportProps) {
  const chosen = scenarioById(scenario);
  const comparisons = (runs ?? []).filter((run) => run.baseline != null);

  return (
    <article className="flex min-h-[70vh] flex-col border-l-2 border-line py-8 pl-6">
      <h2 className="font-heading text-[19px] font-semibold leading-7 tracking-tight text-ink">
        The kidney report — one clearance term, seen as a what-if
      </h2>

      <p className="mt-3 max-w-[46ch] text-[14px] leading-6 text-ink-2">
        In this model the kidneys and the liver are not separate removal
        routes. One total clearance term removes medicine from the single blood
        pool. The
        what-if scales that term; it does not add a renal compartment and it
        does not claim what any organ does in a person.
      </p>

      <p className="mt-3 max-w-[46ch] rounded-[8px] border border-line bg-surface/70 px-3 py-2 text-[12px] leading-5 text-warn">
        {SCENARIO_CONTEXT}
      </p>

      <dl className="mt-4 max-w-[46ch] grid grid-cols-2 gap-2">
        <div className="rounded-[8px] border border-line bg-surface/70 px-3 py-2">
          <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
            Selected setting
          </dt>
          <dd className="mt-0.5 text-[13px] text-ink">{chosen.label}</dd>
        </div>
        <div className="rounded-[8px] border border-line bg-surface/70 px-3 py-2">
          <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
            Clearance multiplier
          </dt>
          <dd className="mt-0.5 font-mono text-[15px] tabular-nums text-brand-text">
            x{chosen.multiplier.toFixed(2)}
          </dd>
        </div>
      </dl>

      {chosen.id === "baseline" ? (
        <p className="mt-5 max-w-[46ch] text-[13px] leading-5 text-ink-3">
          No what-if is selected. The curves use each medicine&rsquo;s cited
          clearance value. Pick a lower-clearance setting to see the engine run
          the same schedule again.
        </p>
      ) : comparisons.length === 0 ? (
        <p className="mt-5 max-w-[46ch] text-[13px] leading-5 text-ink-3">
          Add a medicine and run the simulation to see the two engine outputs
          side by side.
        </p>
      ) : (
        <div className="mt-5 space-y-4">
          {comparisons.map((run) => (
            <section key={run.id}>
              <h3 className="mb-1.5 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-2">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: run.color }}
                  aria-hidden="true"
                />
                {run.name}
              </h3>
              <div className="max-w-[46ch] overflow-x-auto rounded-[8px] border border-line bg-surface/60">
                <table className="w-full min-w-[420px] text-left">
                  <thead>
                    <tr className="border-b border-line/60">
                      {["Engine measure", "Cited baseline", "What-if run"].map((heading) => (
                        <th
                          key={heading}
                          className="px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] font-normal text-ink-3"
                        >
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {compareRuns(run.result, run.baseline!).map((row) => (
                      <tr key={row.label} className="border-b border-line/40 last:border-b-0">
                        <td className="px-3 py-1.5 text-[12px] text-ink-2">{row.label}</td>
                        <td className="px-3 py-1.5 font-mono text-[12px] tabular-nums text-ink-2">
                          {row.baseline}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-[12px] tabular-nums text-brand-text">
                          {row.scenario}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-1.5 max-w-[46ch] text-[11px] leading-4 text-ink-3">
                Both columns are the engine&rsquo;s own output for the same
                medicine and dose schedule. Each curve is modelled separately.
                Interactions are not modelled.
              </p>
            </section>
          ))}
        </div>
      )}

      <section className="mt-6 max-w-[46ch]">
        <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-2">
          Hand-checked papers
        </h3>
        <p className="mt-1 text-[11px] leading-4 text-ink-3">{KIDNEY_CONTEXT_LABEL}</p>
        <ul className="mt-2 space-y-2">
          {KIDNEY_PAPERS.map((paper) => (
            <li key={paper.pmid} className="text-[12px] leading-5">
              <a
                href={kidneyPaperUrl(paper.pmid)}
                target="_blank"
                rel="noreferrer noopener"
                className="text-ink-2 underline decoration-line-strong underline-offset-2 transition-colors duration-150 hover:text-brand-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none"
              >
                {paper.title}
              </a>
              <span className="ml-1.5 font-mono text-[11px] text-ink-3">
                {paper.journal} · {paper.year} · PMID {paper.pmid}
              </span>
              <p className="text-[11px] leading-4 text-ink-3">{paper.context}</p>
            </li>
          ))}
        </ul>
      </section>

      <StepLiterature topic="kidneys" drugs={drugs} />
    </article>
  );
}
