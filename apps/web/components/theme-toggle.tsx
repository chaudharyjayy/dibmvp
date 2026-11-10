"use client";

/** ThemeToggle — bottom-right hold-to-switch control for the red/blue hologram theme. */

import type { Dispatch, SetStateAction } from "react";
import { HoldButton } from "./HoldButton";

export type Theme = "red" | "blue";

export const THEME_COLORS: Record<Theme, { accent: string; glow: string }> = {
  red: { accent: "#ff3b30", glow: "rgba(255, 59, 48, 0.28)" },
  blue: { accent: "#3b82f6", glow: "rgba(59, 130, 246, 0.28)" },
};

export interface ThemeToggleProps {
  currentTheme: Theme;
  setCurrentTheme: Dispatch<SetStateAction<Theme>>;
}

export const ThemeToggle = ({ currentTheme, setCurrentTheme }: ThemeToggleProps) => {
  const accent = THEME_COLORS[currentTheme].accent;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <HoldButton
        doneLabel="Theme changed"
        backgroundColor="rgba(9, 9, 11, 0.82)"
        fillColor={accent}
        textColor="#e4e4e7"
        fillTextColor="#ffffff"
        size="md"
        radius={14}
        fillDirection="right"
        holdTime={1200}
        releaseTime={220}
        pressScale={0.97}
        wave
        waveAmplitude={4}
        glow
        resetAfter={900}
        onHold={() => setCurrentTheme((prev) => (prev === "red" ? "blue" : "red"))}
      >
        hold to change theme
      </HoldButton>
    </div>
  );
};

export default ThemeToggle;
