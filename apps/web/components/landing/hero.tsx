/** Hero — nav overlay only, no body content.
 *  Nav: exactly "Home", "How does this work", "About us".
 */
import Link from "next/link";

export default function Hero() {
  const NAV_LINKS = [
    { label: "Home", href: "/" },
    { label: "How does this work", href: "/how-it-works" },
    { label: "About us", href: "/about" },
  ];

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between px-5 pt-6 sm:px-8 sm:pt-8 md:px-12 lg:px-16">
      <Link
        href="/"
        aria-label="Home"
        className="pointer-events-auto shrink-0 text-white/90 transition-colors hover:text-white"
      >
        <svg
          viewBox="0 0 256 256"
          role="img"
          aria-label="Vibrant Wellness"
          className="h-8 w-8 fill-current md:h-9 md:w-9"
        >
          <path d="M 128 128 C 198.692 128 256 185.308 256 256 L 151.883 256 C 149.812 220.307 120.213 192 84 192 C 47.787 192 18.188 220.307 16.117 256 L 0 256 C 0 185.308 57.308 128 128 128 Z M 104.117 0 C 106.188 35.694 135.787 64 172 64 C 208.213 64 237.812 35.694 239.883 0 L 256 0 C 256 70.692 198.692 128 128 128 C 57.308 128 0 70.692 0 0 Z" />
        </svg>
      </Link>

      <nav className="pointer-events-auto absolute left-1/2 flex -translate-x-1/2 items-center gap-6 rounded-full border border-white/10 bg-white/5 px-6 py-2.5 backdrop-blur-xl sm:gap-8 sm:px-8 sm:py-3">
        {NAV_LINKS.map((link, index) => (
          <Link
            key={link.label}
            href={link.href}
            className={`whitespace-nowrap text-xs font-medium transition-colors sm:text-sm ${
              index === 0 ? "text-white" : "text-zinc-400 hover:text-white"
            }`}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <Link
        href="/signin"
        aria-label="Account"
        className="pointer-events-auto hidden h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-300 backdrop-blur-xl transition hover:border-white/25 hover:text-white md:flex"
      >
        <svg
          viewBox="0 0 24 24"
          role="img"
          aria-label="Account"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="8.5" r="3.5" />
          <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
        </svg>
      </Link>
    </header>
  );
}
