/**
 * Hero copy + figure column. Left column runs x48–640 at 1440 (592px), right
 * column x720–1392 (672px), with the 80px gutter between them.
 *
 * The horizontal padding lives on the text column, not the section, so the
 * figure column can bleed full-width on mobile (spec: 390px-wide canvas) while
 * the copy keeps its 20px gutter.
 *
 * No motion here yet: the load sequence (caption 80ms, H1 lines staggered,
 * figure fade, dial rise) and the scroll pin land in later steps. The
 * data-h1-line hooks exist so those steps do not rechoreograph the markup.
 */

import Link from "next/link";
import FigurePanel from "./figure-panel";
import { type } from "./type";

const H1_LINES = ["See how a drug", "moves through a body,", "hour by hour."];

export default function Hero() {
  return (
    <section className="relative w-full bg-page">
      <div className="mx-auto w-full max-w-[1440px] pb-20 pt-24 md:px-12 md:pb-24">
        <div className="grid items-start gap-14 md:grid-cols-[minmax(0,1fr)_minmax(0,672px)] md:gap-20">
          <div className="max-w-[592px] px-5 md:px-0">
            <p className={`text-ink-2 ${type.caption}`}>Educational simulator</p>

            <h1 className={`mt-6 text-ink ${type.display}`}>
              {H1_LINES.map((line, index) => (
                <span key={line} data-h1-line={index} className="block">
                  {line}
                  {index < H1_LINES.length - 1 ? " " : ""}
                </span>
              ))}
            </h1>

            <p className={`mt-6 max-w-[480px] text-ink-2 ${type.body}`}>
              Set a profile and a dose, then move the time dial to watch an illustrative drug
              level rise and fall.
            </p>

            <div className="mt-8 flex flex-col items-start gap-5 md:flex-row md:items-center md:gap-8">
              <Link
                href="/simulator"
                className="flex h-[52px] w-full items-center justify-center rounded-[10px] bg-ink px-6 text-[15px] font-medium text-white outline-none transition-colors hover:bg-ink/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand md:h-12 md:w-auto"
              >
                Try the simulator
              </Link>

              <Link
                href="/how-it-works"
                className="rounded-[10px] text-[15px] font-medium text-ink-2 outline-none transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
              >
                How does this work <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>

          <FigurePanel />
        </div>
      </div>
    </section>
  );
}
