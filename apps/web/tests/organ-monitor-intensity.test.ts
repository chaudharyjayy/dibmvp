import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { IntensityBar } from "../components/simulator/organ-monitor";

describe("model organ intensity bar", () => {
  const markup = (fill: number) => renderToStaticMarkup(createElement(IntensityBar, { fill }));

  it("is a vertical bar with a definite, non-zero height", () => {
    const html = markup(0.5);
    // The inner fill must carry its own height — a transform-scaled absolute
    // child with no top/height renders as a zero-height, invisible sliver.
    expect(html).toMatch(/height:\s*50\.0%/);
    expect(html).toContain("absolute bottom-0 left-0 w-full");
    expect(html).toContain("h-[36px]");
  });

  it("clamps empty and over-full values so the bar is visible but never spills", () => {
    expect(markup(0)).toMatch(/height:\s*2\.0%/);
    expect(markup(3)).toMatch(/height:\s*100\.0%/);
  });
});
