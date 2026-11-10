/** Hero — pure text, no images or video.
 *  Nav: exactly "Home", "How does this work", "About us".
 *  Simulator reached via the hero button.
 *  Fixed disclaimer on every route.
 */
export default function Hero() {
  const NAV_LINKS = [
    { label: "Home", href: "/" },
    { label: "How does this work", href: "/how-it-works" },
    { label: "About us", href: "/about" },
  ];

  return (
    <section className="relative flex min-h-[100svh] w-full flex-col bg-white text-zinc-900">
      {/* Nav */}
      <header className="relative z-20 flex items-center justify-between px-5 pt-6 sm:px-8 sm:pt-8 md:px-12 lg:px-16">
        <Link href="/" aria-label="Home" className="shrink-0">
          <Logo />
        </Link>

        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-8 rounded-full border border-zinc-200/90 bg-white/70 px-8 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] backdrop-blur-xl md:flex">
          {NAV_LINKS.map((l, i) => (
            <Link
              key={l.label}
              href={l.href}
              className={`text-sm font-medium transition-colors ${
                i === 0 ? "text-zinc-900" : "text-zinc-500 hover:text-zinc-900"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <Link
          href="/signin"
          aria-label="Account"
          className="hidden h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white shadow-sm transition hover:border-zinc-300 md:flex"
        >
          <CircleUserRound className="h-5 w-5 text-zinc-700" strokeWidth={1.5} />
        </Link>
      </header>

      {/* Text hero — no bust, no images. */}
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-4 px-5 py-12 sm:px-8 sm:py-16">
        <p className="text-xs uppercase tracking-[0.22em] text-zinc-400">
          Educational simulator. Population-average estimate. Not medical or dosing advice.
        </p>

        <h1 className="text-3xl font-semibold text-zinc-900 md:text-4xl leading-tight">
          See how a drug moves through the body
        </h1>

        <p className="text-zinc-600 md:text-lg max-w-2xl text-center">
          Enter a drug name, your weight and dose, and view the simulated concentration curve.
        </p>

        {/* The only path from marketing to the product. The nav stays at three items. */}
        <div className="mt-8 flex flex-col items-center gap-4">
          <Link
            href="/simulator"
            className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-8 py-3 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(0,0,0,0.08)] transition hover:bg-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
          >
            Open the simulator
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