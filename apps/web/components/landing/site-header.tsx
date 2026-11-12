"use client";

/**
 * Fixed header: 56px on mobile, 72px from md up, 48px side padding, with a
 * 12px blur. A 1px bottom border fades in over 160ms once the page has
 * scrolled 8px.
 *
 * Nav labels are fixed by product requirement: "Home", "How does this work",
 * "About us". The account icon is the one deliberate addition — without it
 * /signin is unreachable from the landing page.
 *
 * The current page is marked twice on purpose: `aria-current` for assistive
 * technology, and a lit underline for the eye. The underline slides between
 * links rather than cutting, and it is never the only signal.
 */

import { CircleUserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "How does this work", href: "/how-it-works" },
  { label: "About us", href: "/about" },
] as const;

export default function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const navRef = useRef<HTMLElement | null>(null);
  const linkRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  /** Where the marker sits, as a share of the nav's width. */
  const [marker, setMarker] = useState({ left: 0, width: 0, shown: false });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // The marker follows the current link. Measured after layout, and again
  // when the route changes or the font loads.
  useLayoutEffect(() => {
    const measure = () => {
      const nav = navRef.current;
      if (!nav) return;
      const index = NAV_LINKS.findIndex((link) => link.href === pathname);
      const element = index >= 0 ? linkRefs.current[index] : null;
      if (!element) {
        setMarker((m) => ({ ...m, shown: false }));
        return;
      }
      setMarker({
        left: element.offsetLeft,
        width: element.offsetWidth,
        shown: true,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (navRef.current) observer.observe(navRef.current);
    void document.fonts?.ready.then(measure);
    return () => observer.disconnect();
  }, [pathname]);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b bg-page/92 px-5 backdrop-blur-[12px] transition-colors duration-[160ms] md:h-[72px] md:px-12 ${
        scrolled ? "border-line" : "border-transparent"
      }`}
    >
      <Link
        href="/"
        aria-label="Vibrant Wellness home"
        className="shrink-0 rounded-[10px] text-brand-text drop-shadow-[0_0_10px_rgba(34,211,238,0.45)] transition-transform duration-150 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand motion-reduce:transition-none motion-reduce:transform-none"
      >
        <svg viewBox="0 0 256 256" aria-hidden="true" className="h-7 w-7 fill-current md:h-8 md:w-8">
          <path d="M 128 128 C 198.692 128 256 185.308 256 256 L 151.883 256 C 149.812 220.307 120.213 192 84 192 C 47.787 192 18.188 220.307 16.117 256 L 0 256 C 0 185.308 57.308 128 128 128 Z M 104.117 0 C 106.188 35.694 135.787 64 172 64 C 208.213 64 237.812 35.694 239.883 0 L 256 0 C 256 70.692 198.692 128 128 128 C 57.308 128 0 70.692 0 0 Z" />
        </svg>
      </Link>

      <div className="flex items-center gap-4 md:gap-8">
        <nav
          ref={navRef}
          aria-label="Primary"
          className="relative flex items-center gap-4 md:gap-8"
        >
          {/* The marker: a lit underline that slides to the current page. */}
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute -bottom-1 h-px bg-brand-text transition-[transform,width,opacity] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
              marker.shown ? "opacity-100" : "opacity-0"
            }`}
            style={{
              width: marker.width,
              transform: `translate3d(${marker.left}px, 0, 0)`,
            }}
          />

          {NAV_LINKS.map((link, index) => (
            <Link
              key={link.label}
              ref={(element) => {
                linkRefs.current[index] = element;
              }}
              href={link.href}
              aria-current={pathname === link.href ? "page" : undefined}
              className="relative whitespace-nowrap rounded-[10px] py-0.5 text-[13px] font-medium leading-5 text-ink-2 transition-colors duration-150 after:absolute after:inset-x-0 after:-bottom-0.5 after:h-px after:origin-left after:scale-x-0 after:bg-line-strong after:transition-transform after:duration-150 hover:text-brand-text hover:after:scale-x-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand aria-[current=page]:text-brand-text motion-reduce:transition-none motion-reduce:after:transition-none"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <Link
          href="/signin"
          aria-label="Account"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-line-strong text-ink-2 transition-[transform,border-color,color] duration-150 hover:scale-105 hover:border-brand-text hover:text-brand-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand md:h-10 md:w-10 motion-reduce:transition-none motion-reduce:transform-none"
        >
          <CircleUserRound className="h-4 w-4 md:h-5 md:w-5" strokeWidth={1.5} aria-hidden="true" />
        </Link>
      </div>
    </header>
  );
}
