"use client";

/** Landing stage — full-bleed dark scene with the spinning brain hologram,
 *  the nav overlay, and the bottom-right hold-to-change-theme control. */

import { useState } from "react";
import BrainHologram, { type BrainRegion } from "@/components/brain-hologram";
import { THEME_COLORS, ThemeToggle, type Theme } from "@/components/theme-toggle";
import Hero from "./hero";

export default function Landing() {
  const [theme, setTheme] = useState<Theme>("red");
  const [region, setRegion] = useState<BrainRegion | null>(null);

  const { accent, glow } = THEME_COLORS[theme];

  return (
    <main className="relative min-h-[100svh] w-full overflow-hidden bg-[#050506] text-white">
      {/* Ambient light behind the hologram, keyed to the current theme. */}
      <div
        className="pointer-events-none absolute inset-0 transition-[background] duration-700"
        style={{
          background: `radial-gradient(circle at 50% 46%, ${glow} 0%, rgba(5,5,6,0) 62%)`,
        }}
      />

      {/* Faint holographic grid. */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.16]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.16) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.16) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(circle at 50% 50%, black 10%, transparent 72%)",
          WebkitMaskImage: "radial-gradient(circle at 50% 50%, black 10%, transparent 72%)",
        }}
      />

      <div className="absolute inset-0">
        <BrainHologram
          color={accent}
          autoRotate
          rotationSpeed={0.42}
          clickable
          onRegionSelect={setRegion}
          onRegionHover={setRegion}
        />
      </div>

      <Hero />

      {/* Screen-reader summary of the last picked region. */}
      <p className="sr-only" aria-live="polite">
        {region ? `Selected ${region.display}` : "No region selected"}
      </p>

      <ThemeToggle currentTheme={theme} setCurrentTheme={setTheme} />
    </main>
  );
}
