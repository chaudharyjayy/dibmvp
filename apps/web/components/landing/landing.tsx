/**
 * Landing page — direction B, "Glass figure".
 * White page, no vignette: a fixed header, a hero whose right column holds a
 * code-generated see-through figure, then the "what this is and isn't" section
 * and a one-line footer.
 */

import Hero from "./hero";
import SiteFooter from "./site-footer";
import SiteHeader from "./site-header";
import WhatThisIs from "./what-this-is";

export default function Landing() {
  return (
    <main className="w-full bg-page text-ink">
      <SiteHeader />
      <Hero />
      <WhatThisIs />
      <SiteFooter />
    </main>
  );
}
