"use client";

/**
 * The simulator's console: the inputs.
 *
 * A condition, a description of the case, and the dose schedule. The
 * condition decides which organs the walkthrough visits; the description is
 * saved with the report so the numbers have context.
 *
 * Everything is on the dark instrument panel: the landing page's HUD tokens,
 * so the two routes read as one product.
 */

import { useCallback, useRef } from "react";
import { CONDITIONS } from "./condition";

export type DoseRow = {
  timeH: number;
  doseMg: number;
};

export type SimulatorInput = {
  conditionId: string;
  description: string;
  ageYears: number;
  weightKg: number;
  sex: "female" | "male" | "other";
  doses: DoseRow[];
  tEndH: number;
};

type ConsoleProps = {
  value: SimulatorInput;
  onChange: (next: SimulatorInput) => void;
  onSubmit: () => void;
  /** Shown under the form: what is wrong with the input, if anything. */
  error: string | null;
  disabled?: boolean;
};

const fieldLabel = "block font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3 mb-1.5";
const inputClass =
  "w-full rounded-lg border border-line bg-surface/80 px-3 py-2 text-sm text-ink outline-none transition-[border-color,background-color] duration-150 placeholder:text-ink-3 hover:border-line-strong focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/30 motion-reduce:transition-none";

export default function SimulatorConsole({
  value,
  onChange,
  onSubmit,
  error,
  disabled,
}: ConsoleProps) {
  const descriptionRef = useRef<HTMLTextAreaElement | null>(null);

  const set = useCallback(
    <K extends keyof SimulatorInput>(key: K, next: SimulatorInput[K]) => {
      onChange({ ...value, [key]: next });
    },
    [onChange, value]
  );

  /**
   * What is wrong with the input, in the panel's own words.
   *
   * The form does not use the browser's own validation bubbles: the panel
   * says what is wrong and where, in the same place as everything else.
   */
  const localError = (() => {
    if (!Number.isInteger(value.ageYears) || value.ageYears < 1 || value.ageYears > 120) {
      return "Age must be a whole number between 1 and 120.";
    }
    if (!Number.isFinite(value.weightKg) || value.weightKg <= 0 || value.weightKg >= 400) {
      return "Weight must be a number greater than 0 and below 400 kg.";
    }
    if (value.doses.length === 0) {
      return "Add at least one dose.";
    }
    if (value.doses.some((r) => !Number.isFinite(r.doseMg) || r.doseMg <= 0 || r.doseMg > 10_000)) {
      return "Each dose must be a number greater than 0 and at most 10,000 mg.";
    }
    if (value.doses.some((r) => !Number.isFinite(r.timeH) || r.timeH < 0 || r.timeH > value.tEndH)) {
      return `Each dose time must be between 0 and ${value.tEndH} h — the simulated window.`;
    }
    return null;
  })();

  const message = localError ?? error;

  return (
    <form
      className="space-y-6"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (localError) return;
        onSubmit();
      }}
    >
      {/* Condition */}
      <div>
        <label className={fieldLabel} htmlFor="condition">
          Condition
        </label>
        <div className="relative">
          <select
            id="condition"
            value={value.conditionId}
            onChange={(event) => set("conditionId", event.target.value)}
            className={`${inputClass} appearance-none pr-9`}
          >
            {CONDITIONS.map((condition) => (
              <option key={condition.id} value={condition.id} className="bg-surface text-ink">
                {condition.label}
              </option>
            ))}
          </select>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-3"
          >
            ▾
          </span>
        </div>
        <p className="mt-2 text-[13px] leading-5 text-ink-2">
          {CONDITIONS.find((c) => c.id === value.conditionId)?.blurb ??
            "A plain dose with nothing in particular to watch."}
        </p>
      </div>

      {/* Description */}
      <div>
        <label className={fieldLabel} htmlFor="description">
          Description
        </label>
        <textarea
          id="description"
          ref={descriptionRef}
          rows={4}
          value={value.description}
          onChange={(event) => set("description", event.target.value)}
          placeholder="What is happening, in your own words. Saved with the report so the numbers have context."
          className={`${inputClass} resize-y leading-6`}
        />
        <p className="mt-2 text-[12px] leading-4 text-ink-3">
          Free text for the report. The simulator does not read it and does not answer from it.
        </p>
      </div>

      {/* Profile */}
      <div>
        <span className={fieldLabel}>Profile</span>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="sr-only" htmlFor="age">
              Age in years
            </label>
            <input
              id="age"
              type="number"
              min={1}
              max={120}
              step={1}
              value={value.ageYears}
              onChange={(event) => set("ageYears", Number(event.target.value))}
              className={inputClass}
              aria-invalid={!Number.isInteger(value.ageYears) || value.ageYears < 1 || value.ageYears > 120}
            />
            <p className="mt-1 text-center font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
              years
            </p>
          </div>
          <div>
            <label className="sr-only" htmlFor="weight">
              Weight in kilograms
            </label>
            <input
              id="weight"
              type="number"
              min={0.5}
              max={399}
              step={0.5}
              value={value.weightKg}
              onChange={(event) => set("weightKg", Number(event.target.value))}
              className={inputClass}
              aria-invalid={!Number.isFinite(value.weightKg) || value.weightKg <= 0 || value.weightKg >= 400}
            />
            <p className="mt-1 text-center font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
              kg
            </p>
          </div>
          <div>
            <label className="sr-only" htmlFor="sex">
              Sex
            </label>
            <select
              id="sex"
              value={value.sex}
              onChange={(event) => set("sex", event.target.value as SimulatorInput["sex"])}
              className={inputClass}
            >
              <option value="female" className="bg-surface text-ink">
                female
              </option>
              <option value="male" className="bg-surface text-ink">
                male
              </option>
              <option value="other" className="bg-surface text-ink">
                other
              </option>
            </select>
            <p className="mt-1 text-center font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
              sex
            </p>
          </div>
        </div>
        <p className="mt-2 text-[12px] leading-4 text-ink-3">
          Only weight moves the curve: volume and clearance both scale with body weight.
        </p>
      </div>

      {/* Doses */}
      <div>
        <div className="flex items-center justify-between gap-3">
          <span className={fieldLabel}>Dose schedule</span>
          <button
            type="button"
            onClick={() =>
              set("doses", [
                ...value.doses,
                {
                  timeH: Math.min(
                    value.tEndH,
                    (value.doses[value.doses.length - 1]?.timeH ?? 0) + 6
                  ),
                  doseMg: 100,
                },
              ])
            }
            className="rounded-lg border border-line-strong px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-2 transition-[transform,border-color,color] duration-150 hover:border-brand hover:text-brand-text active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none motion-reduce:transform-none"
          >
            + dose
          </button>
        </div>
        <div className="space-y-2">
          {value.doses.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-12 shrink-0 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-3">
                d{i + 1}
              </span>
              <label className="sr-only" htmlFor={`dose-${i}`}>
                Dose {i + 1} amount in milligrams
              </label>
              <input
                id={`dose-${i}`}
                type="number"
                min={1}
                max={10000}
                step={1}
                value={row.doseMg}
                onChange={(event) =>
                  set(
                    "doses",
                    value.doses.map((r, j) =>
                      j === i ? { ...r, doseMg: Number(event.target.value) } : r
                    )
                  )
                }
                className="w-24 rounded-lg border border-line bg-surface/80 px-2 py-1.5 text-sm text-ink outline-none transition-[border-color] duration-150 hover:border-line-strong focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/30 motion-reduce:transition-none"
                aria-invalid={!Number.isFinite(row.doseMg) || row.doseMg <= 0 || row.doseMg > 10_000}
              />
              <span className="shrink-0 font-mono text-[11px] text-ink-3">mg</span>
              <label className="sr-only" htmlFor={`time-${i}`}>
                Dose {i + 1} time in hours
              </label>
              <input
                id={`time-${i}`}
                type="number"
                min={0}
                max={value.tEndH}
                step={0.5}
                value={row.timeH}
                onChange={(event) =>
                  set(
                    "doses",
                    value.doses.map((r, j) =>
                      j === i ? { ...r, timeH: Number(event.target.value) } : r
                    )
                  )
                }
                className="w-24 rounded-lg border border-line bg-surface/80 px-2 py-1.5 text-sm text-ink outline-none transition-[border-color] duration-150 hover:border-line-strong focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/30 motion-reduce:transition-none"
                aria-invalid={
                  !Number.isFinite(row.timeH) || row.timeH < 0 || row.timeH > value.tEndH
                }
              />
              <span className="shrink-0 font-mono text-[11px] text-ink-3">h</span>
              {value.doses.length > 1 ? (
                <button
                  type="button"
                  onClick={() =>
                    set(
                      "doses",
                      value.doses.filter((_, j) => j !== i)
                    )
                  }
                  className="relative shrink-0 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-3 transition-colors duration-150 after:absolute after:-inset-3.5 after:content-[''] hover:text-rose-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none"
                  aria-label={`Remove dose ${i + 1}`}
                >
                  ×
                </button>
              ) : null}
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-3">
          <label className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3" htmlFor="tend">
            Window
          </label>
          <select
            id="tend"
            value={value.tEndH}
            onChange={(event) => {
              const next = Number(event.target.value);
              set("tEndH", next);
              set(
                "doses",
                value.doses.map((r) => ({ ...r, timeH: Math.min(r.timeH, next) }))
              );
            }}
            className="rounded-lg border border-line bg-surface/80 px-2 py-1.5 text-sm text-ink outline-none transition-[border-color] duration-150 hover:border-line-strong focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/30 motion-reduce:transition-none"
          >
            <option value={12}>12 h</option>
            <option value={24}>24 h</option>
            <option value={48}>48 h</option>
            <option value={72}>72 h</option>
          </select>
        </div>
      </div>

      {message ? (
        <p role="alert" className="text-sm text-rose-400">
          {message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={disabled || localError !== null}
        className="w-full rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-[#04121a] transition-[transform,background-color] duration-150 hover:-translate-y-px hover:bg-brand-text active:translate-y-0 active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50 motion-reduce:transition-none motion-reduce:transform-none"
      >
        Run the simulation
      </button>
    </form>
  );
}
