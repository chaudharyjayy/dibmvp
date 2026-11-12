/**
 * Landing page — direction C, "HUD".
 * A dark instrument panel: a fixed header, a hero whose right column holds a
 * code-generated see-through figure, then the "what this is and isn't" section
 * and a one-line footer.
 *
 * The backdrop (gradient, glows, grid, scanlines, vignette) is generated in
 * code in globals.css. The page still ships no images and no video.
 *
 * Landmarks are deliberate: the header and footer sit outside <main> so that
 * `banner` and `contentinfo` are real page landmarks rather than generic
 * containers, and a skip link comes before the navigation. The header is fixed
 * and the hero is a 400svh pin, so without that link a keyboard user would walk
 * the nav again on every pass through the page.
 */

import Hero from "./hero";
import SiteFooter from "./site-footer";
import SiteHeader from "./site-header";
import WhatThisIs from "./what-this-is";

export default function Landing() {
  return (
    <div className="relative z-[2] w-full text-ink">
      {/* The instrument panel the page sits on: base gradient, two colour
          glows, an engineering grid, scanlines and an edge vignette.
          Generated in code — the page ships no images. */}
      <div className="hud-backdrop" aria-hidden="true" />
      <div className="hud-panel" aria-hidden="true">
        <div className="hud-grid" />
        <div className="hud-scanlines" />
        <div className="hud-vignette" />
      </div>

      {/*
        Fixed, not absolute: an absolutely positioned skip link parked above
        the viewport gets scrolled into view when it takes focus, which yanks
        the page back to the top mid-pin. Fixed elements stay put, so focus
        does not move the scroll position.
      */}
      <a
        href="#main"
        className="fixed left-5 top-3 z-[60] -translate-y-24 rounded-[10px] bg-brand px-4 py-3 text-[15px] font-medium text-[#04121a] focus-visible:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-text md:left-12"
      >
        Skip to content
      </a>

      <SiteHeader />

      <main id="main" className="w-full">
        <Hero />
        <WhatThisIs />
      </main>

      <SiteFooter />
    </div>
  );
}
