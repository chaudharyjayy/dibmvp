/**
 * The fixed disclaimer, rendered once in the root layout so that it is present
 * on EVERY route — including before a simulation has run. The wording is fixed
 * (docs/PRD.md §Safety) and must not be paraphrased.
 */
export const DISCLAIMER_TEXT =
  "Educational simulator. Population-average estimate. Not medical or dosing advice.";

export default function Disclaimer() {
  return (
    <footer
      role="note"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 px-4 py-2 text-center text-[10px] leading-4 text-zinc-500 backdrop-blur-sm sm:text-[11px]"
    >
      {DISCLAIMER_TEXT}
    </footer>
  );
}
