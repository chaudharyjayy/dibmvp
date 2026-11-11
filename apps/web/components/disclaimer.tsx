/**
 * The fixed disclaimer, rendered once in the root layout so that it is present
 * on EVERY route — including before a simulation has run. The wording is fixed
 * (docs/PRD.md §Safety) and must not be paraphrased.
 *
 * Bar: 48px on mobile (two lines), 40px from md up, --surface at 92% with a
 * 1px top border, 12/16 centred.
 */
export const DISCLAIMER_TEXT =
  "Educational simulator. Population-average estimate. Not medical or dosing advice.";

export default function Disclaimer() {
  return (
    <footer
      role="note"
      className="fixed inset-x-0 bottom-0 z-40 flex h-12 items-center justify-center border-t border-line bg-surface/92 px-4 text-center font-sans text-[12px] leading-4 text-ink-2 backdrop-blur-sm md:h-10"
    >
      {DISCLAIMER_TEXT}
    </footer>
  );
}
