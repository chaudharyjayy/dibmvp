"use client";

import { useState, useRef } from "react";
import { HoldButton } from "./HoldButton";

/** ThemeToggleButton - Button in corner that changes theme on hold */
export const ThemeToggle = ({
  currentTheme,
  setCurrentTheme,
}: {
  currentTheme: "red" | "blue";
  setCurrentTheme: (theme: "red" | "blue") => void;
}) => {
  const isRedTheme = currentTheme === "red";

  return (
    <div className="fixed right-4 top-4 flex items-center">
      <HoldButton
        doneLabel="Changed"
        backgroundColor="#27272a"
        fillColor={isRedTheme ? "#EF4444" : "#3b82f6"}
        textColor="#f5f5f5"
        fillTextColor="#ffffff"
        size="md"
        radius={14}
        fillDirection="right"
        holdTime={2000}
        releaseTime={200}
        pressScale={0.97}
        wave
        waveAmplitude={6}
        glow
        resetAfter={1200}
        onHold={() => setCurrentTheme(prev => prev === "red" ? "blue" : "red")}
      >
        Hold to change theme
      </HoldButton>
    </div>
  );
};