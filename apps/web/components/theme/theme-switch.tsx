"use client";

import { Moon, Sun } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme, type Theme } from "./theme-provider";

const OPTIONS: ReadonlyArray<{
  value: Theme;
  label: string;
  Icon: typeof Sun;
}> = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
];

/**
 * A two-button, accessible theme control. Before mount both buttons render
 * neutrally, so the saved theme applied by the pre-paint script can never
 * cause a hydration mismatch; the active state appears once the client takes
 * over.
 *
 * `fixed` is the default, used on every route. The simulator places an inline
 * copy beside its header note, so the fixed copy hides there to avoid showing
 * the control twice.
 */
export default function ThemeSwitch({
  variant = "fixed",
}: {
  variant?: "fixed" | "inline";
}) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (variant === "fixed" && pathname === "/simulator") return null;

  return (
    <div
      role="group"
      aria-label="Theme"
      className={
        variant === "inline"
          ? "flex shrink-0 items-center gap-0.5 rounded-full border border-line bg-surface/90 p-1"
          : "fixed right-3 top-[64px] z-[60] flex items-center gap-0.5 rounded-full border border-line bg-surface/90 p-1 shadow-lg backdrop-blur-md md:right-5 md:top-[80px]"
      }
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = mounted && theme === value;
        return (
          <button
            key={value}
            type="button"
            aria-label={`${label} theme`}
            aria-pressed={mounted ? active : false}
            onClick={() => setTheme(value)}
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] uppercase leading-4 tracking-[0.12em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none ${
              active
                ? "bg-brand text-button-ink"
                : "text-ink-3 hover:text-brand-text"
            }`}
          >
            <Icon aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
