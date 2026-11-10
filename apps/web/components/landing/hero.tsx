/** Hero — pure text, no images or video.
 *  Nav: exactly "Home", "How does this work", "About us".
 *  Simulator reached via the hero button.
 *  Fixed disclaimer on every route.
 */
export default function Hero() {
  return (
    <section className="relative flex min-h-[100svh] w-full flex-col bg-white text-zinc-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-4 px-5 py-12 sm:px-8 sm:py-16">
        <heading>heading</heading>
        <h1 className="text-3xl font-semibold text-zinc-900 md:text-4xl leading-tight">
          heading
        </h1>
        <p className="text-zinc-600 md:text-lg max-w-2xl text-center">
          this is a paragraph
        </p>
        <div className="mt-8 flex flex-col items-center gap-4">
          <Link
            href="/simulator"
            className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-8 py-3 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(0,0,0,0.08)] transition hover:bg-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
          >
            heading
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

/* Logo placeholder — kept for the nav header SVGR import.
   Replace with text or remove if unused. */
function Logo() {
  return (
    <svg
      viewBox="0 0 256 256"
      role="img"
      aria-label="Vibrant Wellness"
      className="h-8 w-8 fill-zinc-900 md:h-9 md:w-9"
    >
      <path d="M 128 128 C 198.692 128 256 185.308 256 256 L 151.883 256 C 149.812 220.307 120.213 192 84 192 C 47.787 192 18.188 220.307 16.117 256 L 0 256 C 0 185.308 57.308 128 128 128 Z M 104.117 0 C 106.188 35.694 135.787 64 172 64 C 208.213 64 237.812 35.694 239.883 0 L 256 0 C 256 70.692 198.692 128 128 128 C 57.308 128 0 70.692 0 0 Z" />
    </svg>
  );
}