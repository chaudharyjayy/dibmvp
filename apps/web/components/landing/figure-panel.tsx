"use client";

/**
 * The figure column: the canvas holding the glass figure, and under it a
 * 72px sparkline over a 56px dial strip, labelled as illustrative.
 *
 * Sizing follows the spec except where its own numbers cannot fit: at
 * 1440×900 the chrome (72px header + 40px disclaimer) plus a fixed 700px
 * canvas and the 128px dial leaves nothing on screen, so the desktop canvas
 * is clamped to the viewport between 400 and 700px. On mobile the canvas is
 * full-bleed and at least 50svh.
 *
 * Step 1 ships the frame and the label only — the Three.js scene lands in
 * step 2 and the dial/particles in step 3. The data-* hooks are what those
 * steps mount into, so the layout does not move again.
 */

import { type } from "./type";

export default function FigurePanel({ className = "" }: { className?: string }) {
  return (
    <div className={`w-full ${className}`}>
      <div className="w-full md:ml-auto md:max-w-[672px]">
        <div
          data-figure-canvas
          className="relative h-[max(420px,50svh)] w-full overflow-hidden bg-page md:h-[clamp(400px,calc(100svh-330px),700px)] md:rounded-[12px]"
        >
          <p
            data-figure-placeholder
            className={`absolute inset-0 flex items-center justify-center text-ink-2/50 ${type.caption}`}
          >
            Figure renders here
          </p>
        </div>

        <div className="mt-4 px-2 md:mt-6 md:max-w-[560px] md:px-0">
          <div
            data-dial-sparkline
            className="h-[72px] w-full rounded-t-[12px] border border-b-0 border-line bg-surface"
            aria-hidden="true"
          />
          <div
            data-dial-strip
            className="h-14 w-full rounded-b-[12px] border border-line bg-white"
            aria-hidden="true"
          />
          <p className={`mt-4 text-ink-2 ${type.caption}`}>
            Illustrative shape, not a real drug.
          </p>
        </div>
      </div>
    </div>
  );
}
