"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, CircleUserRound, Menu, X } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

const VIDEO_URL =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260715_082433_69699cf8-444b-4484-93cc-053e57896dfd.mp4";

const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "How does this work", href: "/how-it-works" },
  { label: "About us", href: "/about" },
];

/** Slow, deliberate rotation of the subject in the video. */
const PLAYBACK_RATE = 0.45;
/** One tap / arrow press turns this fraction of a full loop. */
const STEP_FRACTION = 1 / 12;

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

export default function Hero() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [duration, setDuration] = useState(0);
  const [turning, setTurning] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const drag = useRef({ active: false, startX: 0, startTime: 0, moved: 0 });

  // Lock background scrolling while the mobile menu is open.
  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [menuOpen]);

  const wrapTime = (time: number) => {
    if (!duration) return 0;
    const m = time % duration;
    return m < 0 ? m + duration : m;
  };

  const step = (direction: 1 | -1) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    video.currentTime = wrapTime(video.currentTime + direction * duration * STEP_FRACTION);
  };

  function onPointerDown(e: ReactPointerEvent<HTMLVideoElement>) {
    const video = videoRef.current;
    if (!video) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      active: true,
      startX: e.clientX,
      startTime: video.currentTime,
      moved: 0,
    };
    setTurning(true);
    video.pause();
  }

  function onPointerMove(e: ReactPointerEvent<HTMLVideoElement>) {
    const video = videoRef.current;
    const d = drag.current;
    if (!video || !d.active || !duration) return;
    const dx = e.clientX - d.startX;
    d.moved = Math.max(d.moved, Math.abs(dx));
    video.currentTime = wrapTime(
      d.startTime + (dx / Math.max(320, video.clientWidth)) * duration
    );
  }

  function endDrag(e: ReactPointerEvent<HTMLVideoElement>) {
    const video = videoRef.current;
    const d = drag.current;
    if (!video || !d.active) return;
    d.active = false;
    setTurning(false);
    if (d.moved < 5) {
      // A tap, not a drag: nudge the scene one step so it is always clickable.
      step(1);
    }
    void video.play().catch(() => {});
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
  }

  return (
    <section className="relative h-[100svh] w-full overflow-hidden bg-black text-white">
      {/* Background video — drag it, tap it, or use the arrows to turn. */}
      <video
        ref={videoRef}
        className={`absolute inset-0 h-full w-full touch-none object-cover brightness-105 saturate-105 ${
          turning ? "cursor-grabbing" : "cursor-grab"
        }`}
        src={VIDEO_URL}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        aria-label="Rotating wellness scene. Drag left or right to turn it, or use the arrow buttons."
        onLoadedMetadata={(e) => {
          const video = e.currentTarget;
          video.playbackRate = PLAYBACK_RATE;
          setDuration(video.duration || 0);
          void video.play().catch(() => {});
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />

      {/* Light grade — enough contrast for the glass UI, not a blackout */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/40"
      />

      {/* Nav */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between px-5 pt-6 sm:px-8 sm:pt-8 md:px-16 lg:px-20">
        <Link href="/" aria-label="Home" className="pointer-events-auto">
          <Logo />
        </Link>

        <nav className="liquid-glass pointer-events-auto hidden rounded-full px-8 py-3 md:flex md:items-center md:gap-8">
          {NAV_LINKS.map((l, i) => (
            <Link
              key={l.label}
              href={l.href}
              className={`text-sm font-medium transition-opacity ${
                i === 0 ? "text-white" : "text-white/70 hover:opacity-100"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <Link
          href="/signin"
          aria-label="Account"
          className="liquid-glass pointer-events-auto hidden h-10 w-10 items-center justify-center rounded-full md:flex"
        >
          <CircleUserRound className="h-5 w-5 text-white/80" strokeWidth={1.5} />
        </Link>

        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          className="liquid-glass pointer-events-auto relative z-50 flex h-10 w-10 items-center justify-center rounded-full md:hidden"
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

      {/* Turn controls */}
      <div className="pointer-events-none absolute inset-x-0 bottom-8 z-20 flex flex-col items-center gap-3 sm:bottom-10">
        <div className="liquid-glass pointer-events-auto flex items-center gap-1 rounded-full p-1.5">
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Turn left"
            className="flex h-10 w-10 items-center justify-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white"
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
          </button>
          <span className="px-2 text-xs font-light text-white/70">Drag to turn</span>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="Turn right"
            className="flex h-10 w-10 items-center justify-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white"
          >
            <ChevronRight className="h-5 w-5" strokeWidth={1.5} />
          </button>
        </div>
        <p className="text-[11px] font-light text-white/45">
          tap the scene to step · drag left or right to spin
        </p>
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
            <Link
              key={l.label}
              href={l.href}
              onClick={() => setMenuOpen(false)}
              className="text-2xl font-medium text-white/80 transition hover:text-white"
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
