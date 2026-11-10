"use client";

import Link from "next/link";
import { CircleUserRound, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import HeadViewer from "./head-viewer";

const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "How does this work", href: "/how-it-works" },
  { label: "About us", href: "/about" },
];

function Logo() {
  return (
    <svg
      viewBox="0 0 256 256"
      aria-label="Vibrant Wellness"
      className="h-8 w-8 fill-zinc-900 md:h-9 md:w-9"
    >
      <path d="M 128 128 C 198.692 128 256 185.308 256 256 L 151.883 256 C 149.812 220.307 120.213 192 84 192 C 47.787 192 18.188 220.307 16.117 256 L 0 256 C 0 185.308 57.308 128 128 128 Z M 104.117 0 C 106.188 35.694 135.787 64 172 64 C 208.213 64 237.812 35.694 239.883 0 L 256 0 C 256 70.692 198.692 128 128 128 C 57.308 128 0 70.692 0 0 Z" />
    </svg>
  );
}

export default function Hero() {
  const [menuOpen, setMenuOpen] = useState(false);

  // Lock background scrolling while the mobile menu is open.
  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [menuOpen]);

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

        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          className="relative z-50 flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white shadow-sm md:hidden"
        >
          <Menu
            className={`absolute h-5 w-5 text-zinc-900 transition-all duration-300 ${
              menuOpen ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"
            }`}
            strokeWidth={1.5}
          />
          <X
            className={`absolute h-5 w-5 text-zinc-900 transition-all duration-300 ${
              menuOpen ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"
            }`}
            strokeWidth={1.5}
          />
        </button>
      </header>

      {/* The scene is generated in code — no video, no images. */}
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-5 py-6 sm:px-8 sm:py-8">
        <HeadViewer />
      </div>

      {/* Mobile menu overlay */}
      <div
        className={`fixed inset-0 z-10 transition-opacity duration-500 ease-out md:hidden ${
          menuOpen
            ? "pointer-events-auto bg-white/90 opacity-100 backdrop-blur-xl"
            : "pointer-events-none invisible opacity-0"
        }`}
        aria-hidden={!menuOpen}
      >
        <div
          className={`flex h-full flex-col items-center justify-center gap-8 transition-transform duration-500 ease-out ${
            menuOpen ? "translate-y-0" : "-translate-y-8"
          }`}
        >
          {NAV_LINKS.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              onClick={() => setMenuOpen(false)}
              className={`text-2xl font-medium transition-colors ${
                l.href === "/" ? "text-zinc-900" : "text-zinc-500 hover:text-zinc-900"
              }`}
              tabIndex={menuOpen ? 0 : -1}
            >
              {l.label}
            </Link>
          ))}
          <Link
            href="/signin"
            onClick={() => setMenuOpen(false)}
            className="mt-4 flex flex-col items-center gap-3"
            tabIndex={menuOpen ? 0 : -1}
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full border border-zinc-200 bg-white shadow-sm">
              <CircleUserRound className="h-6 w-6 text-zinc-700" strokeWidth={1.5} />
            </span>
            <span className="text-sm font-light text-zinc-500">Account</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
