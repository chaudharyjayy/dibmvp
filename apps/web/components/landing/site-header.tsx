"use client";

/**
 * Fixed header: 56px on mobile, 72px from md up, 48px side padding, white at
 * 80% with a 12px blur. A 1px bottom border fades in over 160ms once the page
 * has scrolled 8px.
 *
 * Nav labels are fixed by product requirement: "Home", "How does this work",
 * "About us". The account icon is the one deliberate addition — without it
 * /signin is unreachable from the landing page.
 */

import { CircleUserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "How does this work", href: "/how-it-works" },
  { label: "About us", href: "/about" },
] as const;

export default function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b bg-white/80 px-5 backdrop-blur-[12px] transition-colors duration-[160ms] md:h-[72px] md:px-12 ${
        scrolled ? "border-line" : "border-transparent"
      }`}
    >
      <Link
        href="/"
        aria-label="Vibrant Wellness home"
        className="shrink-0 rounded-[10px] text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
      >
        <svg viewBox="0 0 256 256" aria-hidden="true" className="h-7 w-7 fill-current md:h-8 md:w-8">
          <path d="M 128 128 C 198.692 128 256 185.308 256 256 L 151.883 256 C 149.812 220.307 120.213 192 84 192 C 47.787 192 18.188 220.307 16.117 256 L 0 256 C 0 185.308 57.308 128 128 128 Z M 104.117 0 C 106.188 35.694 135.787 64 172 64 C 208.213 64 237.812 35.694 239.883 0 L 256 0 C 256 70.692 198.692 128 128 128 C 57.308 128 0 70.692 0 0 Z" />
        </svg>
      </Link>

      <div className="flex items-center gap-4 md:gap-8">
        <nav aria-label="Primary" className="flex items-center gap-4 md:gap-8">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              aria-current={pathname === link.href ? "page" : undefined}
              className="whitespace-nowrap rounded-[10px] py-0.5 text-[13px] font-medium leading-5 text-ink transition-colors hover:text-brand-text focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand md:text-[15px]"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <Link
          href="/signin"
          aria-label="Account"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-ink-2 transition-colors hover:border-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand md:h-10 md:w-10"
        >
          <CircleUserRound className="h-4 w-4 md:h-5 md:w-5" strokeWidth={1.5} aria-hidden="true" />
        </Link>
      </div>
    </header>
  );
}
