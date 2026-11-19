/**
 * Hand-checked papers for the kidney report.
 *
 * The titles, journals and years below were read back from PubMed's esummary
 * endpoint. They are context for the reader: the report says so next to them.
 * Nothing here feeds the engine, and no number from a paper is shown as a
 * model result.
 */

export type KidneyPaper = {
  pmid: string;
  title: string;
  journal: string;
  year: string;
  /** What the reader can take from it, without turning it into advice. */
  context: string;
};

export const KIDNEY_CONTEXT_LABEL =
  "Published context — not the model's output and not advice.";

export const KIDNEY_PAPERS: readonly KidneyPaper[] = [
  {
    pmid: "14606929",
    title: "Principles and clinical application of assessing alterations in renal elimination pathways.",
    journal: "Clinical Pharmacokinetics",
    year: "2003",
    context: "A review of how removal through the kidneys can change and why clearance matters.",
  },
  {
    pmid: "12100232",
    title: "Measurement of renal function during drug development.",
    journal: "British Journal of Clinical Pharmacology",
    year: "2002",
    context: "Explains how kidney function is assessed in studies; this simulator uses no such measure.",
  },
  {
    pmid: "8947968",
    title: "Renal drug transport: a review.",
    journal: "Pharmacotherapy",
    year: "1996",
    context: "Filtration, secretion and reabsorption are separate processes; the model does not split them.",
  },
  {
    pmid: "20528003",
    title: "Rate and extent of drug accumulation after multiple dosing revisited.",
    journal: "Clinical Pharmacokinetics",
    year: "2010",
    context: "Background on how repeated doses change a concentration curve.",
  },
];

/** A PubMed link built from a stored id, never from visitor-typed text. */
export function kidneyPaperUrl(pmid: string): string {
  return `https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(pmid)}/`;
}
