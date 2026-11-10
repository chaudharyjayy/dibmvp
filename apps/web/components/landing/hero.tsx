"use client";

import Link from "next/link";
import { CircleUserRound, Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const VIDEO_URL =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260715_082433_69699cf8-444b-4484-93cc-053e57896dfd.mp4";

const AVATARS = [
  "https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=100",
  "https://images.pexels.com/photos/1222271/pexels-photo-1222271.jpeg?auto=compress&cs=tinysrgb&w=100",
  "https://images.pexels.com/photos/1239291/pexels-photo-1239291.jpeg?auto=compress&cs=tinysrgb&w=100",
  "https://images.pexels.com/photos/697509/pexels-photo-697509.jpeg?auto=compress&cs=tinysrgb&w=100",
];

const NAV_LINKS = [
  { label: "Home", href: "#top", muted: false },
  { label: "Our Approach", href: "#approach", muted: true },
  { label: "Healing Methods", href: "#methods", muted: true },
];

function Logo() {
  return (
    <svg
      viewBox="0 0 256 256"
      aria-label="Vibrant Wellness"
      className="h-8 w-8 fill-white md:h-9 md:w-9"
    >
      <path d="M 128 128 C 198.692 128 256 185.308 256 256 L 151.883 256 C 149.812 220.307 120.213 192 84 192 C 47.787 192 18.188 220.307 16.117 256 L 0 256 C 0 185.308 57.308 128 128 128 Z M 104.117 0 C 106.188 35.694 135.787 64 172 64 C 208.213 64 237.812 35.694 239.883 0 L 256 0 C 256 70.692 198.692 128 128 128 C 57.308 128 0 70.692 0 0 Z" />
    </svg>
  );
}

/** 3x3 triangular dot pattern — 9 squares inside a 20x20 box. */
function TriangleDots() {
  const rows = [
    [8.75],
    [6.25, 11.25],
    [3.75, 8.75, 13.75],
    [6.25, 11.25],
    [8.75],
  ];
  const ys = [0, 4.5, 9, 13.5, 17.5];
  const squares = rows.flatMap((xs, r) =>
    xs.map((x) => ({ x, y: ys[r] }))
  );
  return (
    <div className="relative mb-3 h-5 w-5" aria-hidden="true">
      {squares.map((s, i) => (
        <span
          key={i}
          className="absolute bg-white/60"
          style={{ left: s.x, top: s.y, width: 2.5, height: 2.5 }}
        />
      ))}
    </div>
  );
}

/** 3x3 checkerboard grid of 4px cells — 4 white, 5 transparent. */
function GridIcon() {
  return (
    <div
      className="mb-3 grid w-5 grid-cols-3 gap-[2px]"
      aria-hidden="true"
    >
      {Array.from({ length: 9 }, (_, i) => {
        const r = Math.floor(i / 3);
        const c = i % 3;
        return (
          <span
            key={i}
            className={`h-1 w-1 rounded-[1px] ${
              (r + c) % 2 === 0 ? "bg-white/60" : "bg-white/0"
            }`}
          />
        );
      })}
    </div>
  );
}

export default function Hero() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrollT, setScrollT] = useState(0);
  const [progress, setProgress] = useState(0);
  const raf = useRef(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const onScroll = () => {
      if (raf.current) return;
      raf.current = requestAnimationFrame(() => {
        raf.current = 0;
        const max = document.documentElement.scrollHeight - window.innerHeight;
        setProgress(max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0);
        setScrollT(
          reduce ? 0 : Math.min(1, Math.max(0, window.scrollY / window.innerHeight))
        );
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, []);

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
    <section
      id="top"
      className="sticky top-0 h-[100svh] w-full overflow-hidden bg-black text-white"
    >
      {/* Scroll progress — the one fixed element of the layered page */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[2px] origin-left bg-gradient-to-r from-white/70 via-white/40 to-white/10"
        style={{ transform: `scaleX(${progress})` }}
      />

      {/* Background video */}
      <video
        className="absolute inset-0 h-full w-full object-cover"
        style={{ transform: `scale(${1 + scrollT * 0.08})` }}
        src={VIDEO_URL}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/10 to-black/75"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(0,0,0,0.45)_100%)]"
      />

      {/* Content — drifts back and fades as the next layer covers it */}
      <div
        className="relative z-10 flex h-full flex-col transition-transform duration-700"
        style={{
          transform: `translate3d(0, ${scrollT * 48}px, 0) scale(${1 - scrollT * 0.06})`,
          opacity: 1 - scrollT * 0.55,
        }}
      >
        {/* Nav */}
        <header className="relative z-20 flex items-center justify-between px-5 pt-6 sm:px-8 sm:pt-8 md:px-16 lg:px-20">
          <Link href="#top" aria-label="Vibrant Wellness home">
            <Logo />
          </Link>

          <nav className="liquid-glass hidden rounded-full px-8 py-3 md:flex md:items-center md:gap-8">
            {NAV_LINKS.map((l) => (
              <a
                key={l.label}
                href={l.href}
                className={`text-sm font-medium transition-opacity ${
                  l.muted ? "text-white/70 hover:opacity-100" : "text-white"
                }`}
              >
                {l.label}
              </a>
            ))}
          </nav>

          <Link
            href="/signin"
            aria-label="Account"
            className="liquid-glass hidden h-10 w-10 items-center justify-center rounded-full md:flex"
          >
            <CircleUserRound className="h-5 w-5 text-white/80" strokeWidth={1.5} />
          </Link>

          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            className="liquid-glass relative z-50 flex h-10 w-10 items-center justify-center rounded-full md:hidden"
          >
            <Menu
              className={`absolute h-5 w-5 text-white transition-all duration-300 ${
                menuOpen ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"
              }`}
              strokeWidth={1.5}
            />
            <X
              className={`absolute h-5 w-5 text-white transition-all duration-300 ${
                menuOpen ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"
              }`}
              strokeWidth={1.5}
            />
          </button>
        </header>

        {/* Main */}
        <div
          className={`relative z-10 flex flex-1 flex-col justify-between px-5 pb-8 pt-10 transition-opacity duration-500 sm:px-8 sm:pb-12 sm:pt-12 md:px-16 md:pb-16 lg:px-20 ${
            menuOpen ? "max-md:pointer-events-none max-md:opacity-0" : ""
          }`}
        >
          <div className="mt-4 max-w-2xl sm:mt-8 md:mt-12">
            <div className="liquid-glass mb-5 inline-flex items-center gap-2.5 rounded-full px-3 py-1.5 sm:mb-6 sm:gap-3 sm:px-4 sm:py-2">
              <div className="flex -space-x-2">
                {AVATARS.map((src) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={src}
                    src={src}
                    alt=""
                    width={24}
                    height={24}
                    loading="lazy"
                    className="h-5 w-5 rounded-full border-2 border-white/20 object-cover sm:h-6 sm:w-6"
                  />
                ))}
              </div>
              <span className="text-xs font-light text-white/80 sm:text-sm">
                our path to natural wellness
              </span>
            </div>

            <h1
              className="text-4xl font-normal leading-[1.05] text-white sm:text-5xl md:text-6xl lg:text-7xl"
              style={{ letterSpacing: "-0.05em" }}
            >
              Heal Your Body
              <br />
              Naturally
            </h1>

            <p className="mt-4 text-sm font-light text-white/70 sm:mt-5 sm:text-base md:text-lg">
              Holistic wellness. Transformative results.
            </p>

            <Link
              href="/simulator"
              className="liquid-glass mt-6 inline-block rounded-full px-6 py-3 text-sm font-medium text-white transition duration-300 hover:bg-white/10 sm:mt-8 sm:px-7 sm:py-3.5"
            >
              Begin Your Journey
            </Link>
          </div>

          <div className="flex items-end gap-6 sm:gap-10 md:gap-16">
            <div>
              <TriangleDots />
              <p className="text-xl font-normal text-white sm:text-2xl md:text-3xl">
                48 Hours
              </p>
              <p className="text-xs font-light text-white/60 sm:text-sm">
                Initial Consultation
              </p>
            </div>
            <div>
              <GridIcon />
              <p className="text-xl font-normal text-white sm:text-2xl md:text-3xl">
                Initial Consultation
              </p>
              <p className="text-xs font-light text-white/60 sm:text-sm">
                Healing Sessions
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile menu overlay */}
      <div
        className={`fixed inset-0 z-10 bg-black/80 backdrop-blur-xl transition-opacity duration-500 ease-out md:hidden ${
          menuOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-hidden={!menuOpen}
      >
        <div
          className={`flex h-full flex-col items-center justify-center gap-8 transition-transform duration-500 ease-out ${
            menuOpen ? "translate-y-0" : "-translate-y-8"
          }`}
        >
          {NAV_LINKS.map((l) => (
            <a
              key={l.label}
              href={l.href}
              onClick={() => setMenuOpen(false)}
              className={`text-2xl font-medium ${
                l.muted ? "text-white/70" : "text-white"
              }`}
              tabIndex={menuOpen ? 0 : -1}
            >
              {l.label}
            </a>
          ))}
          <Link
            href="/signin"
            onClick={() => setMenuOpen(false)}
            className="mt-4 flex flex-col items-center gap-3"
            tabIndex={menuOpen ? 0 : -1}
          >
            <span className="liquid-glass flex h-12 w-12 items-center justify-center rounded-full">
              <CircleUserRound className="h-6 w-6 text-white/80" strokeWidth={1.5} />
            </span>
            <span className="text-sm font-light text-white/60">Account</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
