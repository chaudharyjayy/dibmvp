/**
 * The 80svh section after the pinned sequence: three short columns saying what
 * the product is for and — more importantly — what it is not.
 */

import { LOAD, riseStyle } from "./load";
import { type } from "./type";

const COLUMNS = [
  {
    heading: "Educational",
    body: "A teaching tool. It exists to show how a population-average model behaves, not to predict what happens to one person.",
  },
  {
    heading: "A shape, not a substance",
    body: "The dial follows an illustrative curve that rises, peaks and falls. The shape is unitless and does not describe a specific medicine.",
  },
  {
    heading: "Not advice",
    body: "Nothing here is medical or dosing advice, and the model has not been validated for patients. Speak to a clinician about your own care.",
  },
] as const;

export default function WhatThisIs() {
  return (
    <section className="relative w-full border-t border-line bg-page/70">
      <div className="mx-auto flex min-h-[80svh] w-full max-w-[1440px] flex-col justify-center px-5 py-20 md:px-12">
        <h2
          className={`landing-load text-ink ${type.h2}`}
          style={riseStyle(0, LOAD.body.duration, LOAD.body.y)}
        >
          What this is and isn’t
        </h2>

        <div className="mt-12 grid gap-10 md:grid-cols-3 md:gap-12">
          {COLUMNS.map((column, index) => (
            <div
              key={column.heading}
              className="landing-load"
              style={riseStyle(
                60 + index * LOAD.h1.stagger,
                LOAD.body.duration,
                LOAD.body.y
              )}
            >
              <h3 className={`text-ink ${type.h3}`}>{column.heading}</h3>
              <p className={`mt-3 text-ink-2 ${type.body}`}>{column.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
