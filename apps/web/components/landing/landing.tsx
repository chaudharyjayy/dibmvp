/**
 * Landing page — direction B, "Glass figure".
 * White page, no vignette: a fixed header, a hero whose right column holds a
 * code-generated see-through figure, then the "what this is and isn't" section
 * and a one-line footer.
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
    <div className="w-full bg-page text-ink">
      {/*
        Fixed, not absolute: an absolutely positioned skip link parked above
        the viewport gets scrolled into view when it takes focus, which yanks
        the page back to the top mid-pin. Fixed elements stay put, so focus
        does not move the scroll position.
      */}
      <a
        href="#main"
        className="fixed left-5 top-3 z-[60] -translate-y-24 rounded-[10px] bg-ink px-4 py-3 text-[15px] font-medium text-white focus-visible:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand md:left-12"
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
