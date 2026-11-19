"use client";

/**
 * The simulator's console: the inputs.
 *
 * A condition, a description of the case, the medicines (from the drug
 * catalogue), and the dose schedule per medicine. The condition decides
 * which organs the walkthrough visits; the description is saved with the
 * report so the numbers have context.
 *
 * Medicines come from the catalogue, not from free text: the search
 * queries the same database the report stores, and a medicine can only be
 * added once its approved, cited pharmacokinetics exist — a drug without
 * sourced parameters is shown as not simulatable rather than run on made
 * up numbers.
 *
 * Everything is on the dark instrument panel: the landing page's HUD tokens,
 * so the two routes read as one product.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { CONDITIONS, conditionById } from "./condition";
import { suggestionsFor } from "./medicine-suggestions";
import { parsePrescription } from "./prescription";
import { getApprovedPk, searchCatalogue } from "@/lib/catalogue";
import {
  CLEARANCE_SCENARIOS,
  SCENARIO_CONTEXT,
  type ClearanceScenarioId,
} from "@/lib/kidney-scenario";
import type { DrugParameterCitation } from "@dib/data-client";
import { isValidated } from "@/lib/validation-status";
import { readMedicalPdf, type PdfImportResult } from "@/lib/pdf-import";
import {
  HEART_PROFILES,
  KIDNEY_PROFILES,
  LIVER_PROFILES,
  LUNG_PROFILES,
  getOrganProfilesForCondition,
  type OrganProfileSelection,
  type HeartProfileId,
  type KidneyProfileId,
  type LiverProfileId,
  type LungProfileId,
} from "@dib/engine";

/**
 * Number boxes keep their text. An empty box is an empty string — never a 0
 * quietly put back by a change or blur handler. The empty string is resolved
 * to 0 only when the simulation is run.
 */
export type DoseRow = {
  timeH: string;
  doseMg: string;
  doseFromPdf?: boolean;
  timeFromPdf?: boolean;
};

/** A value from a PDF that had no matching box, shown as its own input. */
export type ExtraField = {
  key: string;
  label: string;
  value: string;
  unit?: string;
  range?: string;
  fromPdf?: boolean;
};

/** One medicine in the treatment: identity from the catalogue, rows editable. */
export type DrugLine = {
  /** The catalogue's normalized ingredient id. */
  drugId: string;
  name: string;
  doses: DoseRow[];
  /** The range the source studied, from the approved PK row. */
  doseRange: [number, number] | null;
  /** Whether an approved PK row exists at all; without one, no run. */
  hasPk: boolean;
};

export type SimulatorInput = {
  conditionId: string;
  description: string;
  ageYears: string;
  weightKg: string;
  sex: "female" | "male" | "other";
  drugs: DrugLine[];
  tEndH: number;
  organProfiles?: OrganProfileSelection;
  /** An extra synthetic what-if on clearance, on top of the organ profiles. */
  clearanceScenario: ClearanceScenarioId;
  /** Values from an uploaded PDF with no matching built-in box. */
  extraFields?: ExtraField[];
  /** True when age was filled from a PDF, for the "from PDF" badge. */
  ageFromPdf?: boolean;
  /** True when weight was filled from a PDF, for the "from PDF" badge. */
  weightFromPdf?: boolean;
};

/**
 * An empty number box counts as 0 at run time, and shows 0 from that moment.
 * Nothing here writes back on change, blur, or any other event — the user can
 * leave a box empty for as long as they like.
 */
export function normalizeInput(input: SimulatorInput): SimulatorInput {
  const zero = (text: string) => (text.trim() === "" ? "0" : text);
  return {
    ...input,
    ageYears: zero(input.ageYears),
    weightKg: zero(input.weightKg),
    drugs: input.drugs.map((drug) => ({
      ...drug,
      doses: drug.doses.map((row) => ({
        ...row,
        doseMg: zero(row.doseMg),
        timeH: zero(row.timeH),
      })),
    })),
    extraFields: input.extraFields?.map((field) => ({ ...field, value: zero(field.value) })),
  };
}

/**
 * Merge values read from a PDF into the form. Matching boxes are filled in
 * place; everything else becomes a labelled extra field. Every filled box is
 * marked so the visitor can check and edit it before running.
 */
export function applyPdfImport(input: SimulatorInput, imported: PdfImportResult): SimulatorInput {
  let ageYears = input.ageYears;
  let weightKg = input.weightKg;
  let ageFromPdf = input.ageFromPdf ?? false;
  let weightFromPdf = input.weightFromPdf ?? false;
  let tEndH = input.tEndH;
  const extraByKey = new Map((input.extraFields ?? []).map((field) => [field.key, field]));
  const dosesByDrug = new Map(input.drugs.map((drug) => [drug.drugId, [...drug.doses]]));
  let doseCursor = 0;

  for (const match of imported.matches) {
    switch (match.key) {
      case "ageYears":
        ageYears = match.value;
        ageFromPdf = true;
        break;
      case "weightKg":
        weightKg = match.value;
        weightFromPdf = true;
        break;
      case "tEndH": {
        const hours = Number(match.value);
        if (Number.isFinite(hours) && hours > 0) tEndH = Math.min(168, Math.round(hours));
        break;
      }
      case "doseMg":
      case "timeH": {
        // Fill the first existing dose row; if there is none (or the visitor
        // has already received one PDF dose), add a row in the first medicine.
        const firstDrug = input.drugs[0];
        if (!firstDrug) break;
        const rows = dosesByDrug.get(firstDrug.drugId) ?? [];
        let row = rows[doseCursor];
        if (!row) {
          row = { doseMg: "0", timeH: "0" };
          rows.push(row);
        }
        rows[doseCursor] = {
          ...row,
          ...(match.key === "doseMg"
            ? { doseMg: match.value, doseFromPdf: true }
            : { timeH: match.value, timeFromPdf: true }),
        };
        if (match.key === "timeH") doseCursor += 1;
        break;
      }
      case "extra": {
        if (!match.extraKey) break;
        const unit = match.unit ? ` ${match.unit}` : "";
        const range = match.range ? ` · normal ${match.range}` : "";
        extraByKey.set(match.extraKey, {
          key: match.extraKey,
          label: `${match.name}${unit}${range}`,
          value: match.value,
          unit: match.unit,
          range: match.range,
          fromPdf: true,
        });
        break;
      }
    }
  }

  return {
    ...input,
    ageYears,
    weightKg,
    ageFromPdf,
    weightFromPdf,
    tEndH,
    drugs: input.drugs.map((drug) => ({
      ...drug,
      doses: dosesByDrug.get(drug.drugId) ?? drug.doses,
    })),
    extraFields: [...extraByKey.values()],
  };
}

type ConsoleProps = {
  value: SimulatorInput;
  onChange: (next: SimulatorInput) => void;
  onSubmit: () => void;
  /** Shown under the form: what is wrong with the input, if anything. */
  error: string | null;
  disabled?: boolean;
  /** The citation behind each value of each medicine's parameters. */
  citations?: Map<string, DrugParameterCitation[]>;
};

const fieldLabel = "block font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3 mb-1.5";
const inputClass =
  "w-full rounded-lg border border-line bg-surface/80 px-3 py-2 text-sm text-ink outline-none transition-[border-color,background-color] duration-150 placeholder:text-ink-3 hover:border-line-strong focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/30 motion-reduce:transition-none";
const smallInputClass =
  "rounded-lg border border-line bg-surface/80 px-2 py-1.5 text-sm text-ink outline-none transition-[border-color] duration-150 hover:border-line-strong focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/30 motion-reduce:transition-none";
const ghostButtonClass =
  "rounded-lg border border-line-strong px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-2 transition-[transform,border-color,color] duration-150 hover:border-brand hover:text-brand-text active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none motion-reduce:transform-none";

/** The most medicines one treatment may hold (the report schema's limit). */
const MAX_DRUGS = 5;

type CatalogueHit = {
  id: string;
  name: string;
  routes: string[];
  pkStatus: "unsourced" | "partial" | "reviewed";
  productCount: number;
};

export default function SimulatorConsole({
  value,
  onChange,
  onSubmit,
  error,
  disabled,
  citations,
}: ConsoleProps) {
  const descriptionRef = useRef<HTMLTextAreaElement | null>(null);
  const set = useCallback(
    <K extends keyof SimulatorInput>(key: K, next: SimulatorInput[K]) => {
      onChange({ ...value, [key]: next });
    },
    [onChange, value]
  );

  /** Patch one drug line, in place. */
  const setDrug = useCallback(
    (index: number, patch: Partial<DrugLine>) => {
      onChange({
        ...value,
        drugs: value.drugs.map((d, i) => (i === index ? { ...d, ...patch } : d)),
      });
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
    // An empty box and 0 both mean "not set": the engine uses a reference
    // adult for those profile values. Anything else must be in range.
    const age = value.ageYears.trim() === "" ? 0 : Number(value.ageYears);
    if (!Number.isFinite(age) || (age !== 0 && (!Number.isInteger(age) || age < 1 || age > 120))) {
      return "Age must be a whole number between 1 and 120.";
    }
    const weight = value.weightKg.trim() === "" ? 0 : Number(value.weightKg);
    if (!Number.isFinite(weight) || (weight !== 0 && (weight <= 0 || weight >= 400))) {
      return "Weight must be a number greater than 0 and below 400 kg.";
    }
    if (value.drugs.length === 0) {
      return "Add a medicine from the catalogue.";
    }
    const unrunnable = value.drugs.find((d) => !d.hasPk);
    if (unrunnable) {
      return `${unrunnable.name} has no sourced pharmacokinetics yet, so it cannot be simulated. Remove it to run.`;
    }
    for (const drug of value.drugs) {
      if (drug.doses.length === 0) {
        return `Add at least one dose for ${drug.name}.`;
      }
      // There is deliberately no upper dose bound: any amount can be entered.
      // A high amount is allowed through to the engine, where the toxicity
      // model can fail an organ and stop the run.
      for (const row of drug.doses) {
        const dose = row.doseMg.trim() === "" ? 0 : Number(row.doseMg);
        if (!Number.isFinite(dose) || dose < 0) {
          return `Each ${drug.name} dose must be a number of 0 or greater.`;
        }
        const time = row.timeH.trim() === "" ? 0 : Number(row.timeH);
        if (!Number.isFinite(time) || time < 0 || time > value.tEndH) {
          return `Each ${drug.name} dose time must be between 0 and ${value.tEndH} h — the simulated window.`;
        }
      }
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
            onChange={(event) => {
              const nextId = event.target.value;
              onChange({
                ...value,
                conditionId: nextId,
                organProfiles: getOrganProfilesForCondition(nextId),
              });
            }}
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

      {/* Medicines */}
      <div>
        <span className={fieldLabel}>Medicines</span>
        <DrugSearch
          conditionId={value.conditionId}
          selectedIds={value.drugs.map((d) => d.drugId)}
          full={value.drugs.length >= MAX_DRUGS}
          onAdd={(hit, range) =>
            onChange({
              ...value,
              drugs: [
                ...value.drugs,
                {
                  drugId: hit.id,
                  name: hit.name,
                  // No default dose: the visitor chooses it, seeing the studied range.
                  doses: [],
                  doseRange: range,
                  hasPk: true,
                },
              ],
            })
          }
        />
        <PdfUpload value={value} onChange={onChange} />

        <div className="mt-3 space-y-2">
          {value.drugs.map((drug, index) => (
            <DrugCard
              key={drug.drugId}
              citations={citations?.get(drug.drugId)}
              drug={drug}
              index={index}
              tEndH={value.tEndH}
              onPatch={(patch) => setDrug(index, patch)}
              onLoadScript={(doses, neededWindowH) => {
                const tEndH = Math.max(value.tEndH, neededWindowH);
                onChange({
                  ...value,
                  tEndH,
                  drugs: value.drugs.map((d, i) =>
                    i === index
                      ? {
                          ...d,
                          doses: doses.map((r) => ({
                            ...r,
                            timeH: String(Math.min(Number(r.timeH) || 0, tEndH)),
                          })),
                        }
                      : d
                  ),
                });
              }}
              onRemove={() =>
                set("drugs", value.drugs.filter((_, i) => i !== index))
              }
            />
          ))}
        </div>
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
              step={1}
              inputMode="numeric"
              value={value.ageYears}
              onChange={(event) => set("ageYears", event.target.value)}
              className={inputClass}
            />
            <p className="mt-1 text-center font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
              years{value.ageFromPdf ? " · from PDF" : ""}
            </p>
          </div>
          <div>
            <label className="sr-only" htmlFor="weight">
              Weight in kilograms
            </label>
            <input
              id="weight"
              type="number"
              step={0.5}
              inputMode="decimal"
              value={value.weightKg}
              onChange={(event) => set("weightKg", event.target.value)}
              className={inputClass}
            />
            <p className="mt-1 text-center font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
              kg{value.weightFromPdf ? " · from PDF" : ""}
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
          Only weight moves the curve: each medicine's volume and clearance scale with body weight.
        </p>
      </div>

      {/* Values from a PDF that had no matching box above. */}
      {value.extraFields && value.extraFields.length > 0 ? (
        <div className="rounded-xl border border-line bg-surface/40 p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <span className={fieldLabel}>Values from the PDF</span>
            <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-brand-text">
              {value.extraFields.length} added
            </span>
          </div>
          <p className="text-[11px] leading-4 text-ink-3">
            These had no matching input above. Check each value before running.
          </p>
          <div className="mt-3 space-y-2">
            {value.extraFields.map((field) => (
              <div key={field.key} className="flex items-center gap-2">
                <label className="min-w-0 flex-1" htmlFor={`extra-${field.key}`}>
                  <span className="block truncate text-[12px] text-ink-2" title={field.label}>
                    {field.label}
                  </span>
                  {field.fromPdf ? (
                    <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-brand-text">
                      from PDF
                    </span>
                  ) : null}
                </label>
                <input
                  id={`extra-${field.key}`}
                  type="number"
                  value={field.value}
                  onChange={(event) =>
                    set("extraFields", (value.extraFields ?? []).map((f) =>
                      f.key === field.key ? { ...f, value: event.target.value } : f
                    ))
                  }
                  className={`${smallInputClass} w-28`}
                />
                {field.unit ? (
                  <span className="shrink-0 font-mono text-[11px] text-ink-3">{field.unit}</span>
                ) : null}
                <button
                  type="button"
                  onClick={() =>
                    set("extraFields", (value.extraFields ?? []).filter((f) => f.key !== field.key))
                  }
                  className="relative shrink-0 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-3 transition-colors duration-150 after:absolute after:-inset-3 after:content-[''] hover:text-rose-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  aria-label={`Remove ${field.label}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Organ Archetype Profiles */}
      <div className="rounded-xl border border-line bg-surface/40 p-4">
        <div className="flex items-baseline justify-between mb-2">
          <span className={fieldLabel}>Organ Archetypes & Physiology</span>
          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-brand-text">
            Multi-Organ Reference
          </span>
        </div>
        <p className="text-[11px] leading-4 text-ink-3 mb-3">
          Synthetic clinical archetypes for cardiovascular, renal, hepatic, and pulmonary function.
        </p>

        <div className="space-y-3">
          {/* Heart */}
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-[0.1em] text-ink-2 mb-1" htmlFor="heart-profile">
              Heart ({HEART_PROFILES.find((p) => p.profile_id === value.organProfiles?.heartId)?.nyha_class === "none" ? "Healthy" : `NYHA ${HEART_PROFILES.find((p) => p.profile_id === value.organProfiles?.heartId)?.nyha_class}`})
            </label>
            <select
              id="heart-profile"
              value={value.organProfiles?.heartId ?? "heart_healthy_adult"}
              onChange={(e) =>
                onChange({
                  ...value,
                  organProfiles: {
                    ...value.organProfiles,
                    heartId: e.target.value as HeartProfileId,
                  },
                })
              }
              className={`${inputClass} text-xs py-1.5`}
            >
              {HEART_PROFILES.map((p) => (
                <option key={p.profile_id} value={p.profile_id} className="bg-surface text-ink">
                  {p.label} (LVEF {p.lvef_pct}%, HR {p.resting_heart_rate_bpm})
                </option>
              ))}
            </select>
          </div>

          {/* Kidney */}
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-[0.1em] text-ink-2 mb-1" htmlFor="kidney-profile">
              Kidneys ({KIDNEY_PROFILES.find((p) => p.profile_id === value.organProfiles?.kidneyId)?.ckd_stage})
            </label>
            <select
              id="kidney-profile"
              value={value.organProfiles?.kidneyId ?? "kidney_healthy_adult"}
              onChange={(e) =>
                onChange({
                  ...value,
                  organProfiles: {
                    ...value.organProfiles,
                    kidneyId: e.target.value as KidneyProfileId,
                  },
                })
              }
              className={`${inputClass} text-xs py-1.5`}
            >
              {KIDNEY_PROFILES.map((p) => (
                <option key={p.profile_id} value={p.profile_id} className="bg-surface text-ink">
                  {p.label} (eGFR {p.egfr_ml_min_1_73m2}, CL scale {(p.clearance_scaling_factor * 100).toFixed(0)}%)
                </option>
              ))}
            </select>
          </div>

          {/* Liver */}
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-[0.1em] text-ink-2 mb-1" htmlFor="liver-profile">
              Liver ({LIVER_PROFILES.find((p) => p.profile_id === value.organProfiles?.liverId)?.child_pugh_class === "none" ? "Normal" : `Child-Pugh ${LIVER_PROFILES.find((p) => p.profile_id === value.organProfiles?.liverId)?.child_pugh_class}`})
            </label>
            <select
              id="liver-profile"
              value={value.organProfiles?.liverId ?? "liver_healthy_adult"}
              onChange={(e) =>
                onChange({
                  ...value,
                  organProfiles: {
                    ...value.organProfiles,
                    liverId: e.target.value as LiverProfileId,
                  },
                })
              }
              className={`${inputClass} text-xs py-1.5`}
            >
              {LIVER_PROFILES.map((p) => (
                <option key={p.profile_id} value={p.profile_id} className="bg-surface text-ink">
                  {p.label} (CL scale {(p.clearance_scaling_factor * 100).toFixed(0)}%)
                </option>
              ))}
            </select>
          </div>

          {/* Lungs */}
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-[0.1em] text-ink-2 mb-1" htmlFor="lung-profile">
              Lungs ({LUNG_PROFILES.find((p) => p.profile_id === value.organProfiles?.lungId)?.smoking_status === "never" ? "Non-smoker" : `Smoker (${LUNG_PROFILES.find((p) => p.profile_id === value.organProfiles?.lungId)?.pack_years} pack-yrs)`})
            </label>
            <select
              id="lung-profile"
              value={value.organProfiles?.lungId ?? "lung_healthy_adult"}
              onChange={(e) =>
                onChange({
                  ...value,
                  organProfiles: {
                    ...value.organProfiles,
                    lungId: e.target.value as LungProfileId,
                  },
                })
              }
              className={`${inputClass} text-xs py-1.5`}
            >
              {LUNG_PROFILES.map((p) => (
                <option key={p.profile_id} value={p.profile_id} className="bg-surface text-ink">
                  {p.label} (FEV1 {p.fev1_pct_predicted}%, SpO2 {p.spo2_rest_pct}%)
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Extra clearance what-if — a model setting, never a patient measurement. */}
      <fieldset>
        <legend className={fieldLabel}>Model what-if · extra clearance</legend>
        <p className="mb-2 text-[11px] leading-4 text-ink-3">
          Applied on top of the organ profiles above. The cited baseline run is
          kept beside it for comparison.
        </p>
        <div className="space-y-1.5">
          {CLEARANCE_SCENARIOS.map((scenario) => (
            <label
              key={scenario.id}
              className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line bg-surface/60 px-3 py-2 transition-colors duration-150 hover:border-line-strong focus-within:border-brand motion-reduce:transition-none"
            >
              <input
                type="radio"
                name="clearance-scenario"
                value={scenario.id}
                checked={value.clearanceScenario === scenario.id}
                onChange={() => set("clearanceScenario", scenario.id)}
                className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[#22d3ee]"
              />
              <span>
                <span className="block text-[13px] text-ink">{scenario.label}</span>
                <span className="mt-0.5 block text-[12px] leading-4 text-ink-3">
                  {scenario.note}
                </span>
              </span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-[12px] leading-4 text-ink-3">{SCENARIO_CONTEXT}</p>
      </fieldset>

      {/* Window */}
      <div>
        <div className="flex items-center gap-3">
          <label className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3" htmlFor="tend">
            Window
          </label>
          <select
            id="tend"
            value={value.tEndH}
            onChange={(event) => {
              const next = Number(event.target.value);
              onChange({
                ...value,
                tEndH: next,
                drugs: value.drugs.map((d) => ({
                  ...d,
                  doses: d.doses.map((r) => ({
                    ...r,
                    timeH: String(Math.min(Number(r.timeH) || 0, next)),
                  })),
                })),
              });
            }}
            className={smallInputClass}
          >
            <option value={12}>12 h</option>
            <option value={24}>24 h</option>
            <option value={48}>48 h</option>
            <option value={72}>72 h</option>
          </select>
        </div>
        <p className="mt-2 text-[12px] leading-4 text-ink-3">
          The simulated window, shared by every medicine in the treatment.
        </p>
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

/* ---- the catalogue search ------------------------------------------------ */

function DrugSearch({
  conditionId,
  selectedIds,
  full,
  onAdd,
}: {
  conditionId: string;
  selectedIds: string[];
  full: boolean;
  onAdd: (hit: CatalogueHit, range: [number, number] | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<CatalogueHit[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  // Debounced catalogue search: quiet while typing, one request per pause.
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2 || full) {
      setHits(null);
      setOpen(false);
      return;
    }
    setBusy(true);
    const timer = setTimeout(() => {
      searchCatalogue(term, 12)
        .then((result) => {
          setHits(result.hits ?? []);
          setOpen(true);
        })
        .catch(() => {
          setHits([]);
          setOpen(true);
        })
        .finally(() => setBusy(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [query, full]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  /** Adds a drug: fetch its approved PK row first; the add confirms it exists. */
  const add = (hit: CatalogueHit, shownName?: string) => {
    setOpen(false);
    setQuery(shownName ?? "");
    setBusy(true);
    Promise.resolve(getApprovedPk(hit.id))
      .then((pk) => {
        const range =
          pk && pk !== "error" && pk !== "unconfigured" && pk.doseMinMg != null && pk.doseMaxMg != null
            ? ([Number(pk.doseMinMg), Number(pk.doseMaxMg)] as [number, number])
            : null;
        onAdd(hit, range);
      })
      .catch(() => onAdd(hit, null))
      .finally(() => setBusy(false));
  };

  /** A one-click button is the same add path, with the name left in the field. */
  const addQuick = (id: string, name: string) => {
    add({ id, name, routes: [], pkStatus: "reviewed", productCount: 0 }, name);
  };

  const suggestions = suggestionsFor(conditionId);

  return (
    <div ref={boxRef} className="relative">
      <input
        id="drug-search"
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls="drug-search-results"
        autoComplete="off"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => hits && hits.length > 0 && setOpen(true)}
        placeholder={full ? `Treatment is full (${MAX_DRUGS})` : "Search the catalogue — e.g. ibuprofen"}
        disabled={full}
        className={inputClass}
      />

      {/* Suggestions for the picked condition — directly under the search field. */}
      <div className="mt-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
          Commonly used for {conditionById(conditionId).label}
        </p>
        {suggestions.length > 0 ? (
          <div
            className="mt-1.5 flex flex-wrap gap-1.5"
            aria-label="Suggested medicines for the selected condition"
          >
            {suggestions.map((medicine) => (
              <button
                key={medicine.id}
                type="button"
                disabled={full || selectedIds.includes(medicine.id)}
                onClick={() => addQuick(medicine.id, medicine.name)}
                className={`${ghostButtonClass} normal-case tracking-normal disabled:cursor-not-allowed disabled:opacity-45`}
              >
                {selectedIds.includes(medicine.id) ? "✓ " : "+ "}
                {medicine.name}
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-[12px] leading-4 text-ink-3">
            No medicine with a sourced PK row matches this condition yet. Search
            the catalogue above, or leave the treatment empty.
          </p>
        )}
        <p className="mt-1.5 text-[11px] leading-4 text-ink-3">
          Examples from the sourced catalogue — up to {MAX_DRUGS} medicines. This
          model shows how a dose moves through the body; it does not model
          disease treatment.
        </p>
      </div>

      {busy ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3"
        >
          …
        </span>
      ) : null}
      {open && hits ? (
        <ul
          id="drug-search-results"
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-line bg-surface shadow-[0_16px_40px_rgba(0,0,0,0.55)]"
        >
          {hits.length === 0 ? (
            <li className="px-3 py-2 text-[13px] text-ink-3">Nothing in the catalogue for that.</li>
          ) : (
            hits.map((hit) => {
              const already = selectedIds.includes(hit.id);
              const runnable = hit.pkStatus === "reviewed";
              return (
                <li key={hit.id} className="border-b border-line/60 last:border-b-0">
                  <button
                    type="button"
                    disabled={already || !runnable}
                    onClick={() => add(hit)}
                    className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[13px] transition-colors duration-150 motion-reduce:transition-none ${
                      already || !runnable
                        ? "cursor-not-allowed text-ink-3"
                        : "text-ink hover:bg-brand/10"
                    }`}
                  >
                    <span className="truncate">{hit.name}</span>
                    <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.1em]">
                      {already
                        ? "added"
                        : runnable
                          ? "author-verified"
                          : hit.pkStatus === "partial"
                            ? "pk partial"
                            : "pk not sourced"}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}


/* ---- upload a medical PDF ----------------------------------------------- */

function PdfUpload({
  value,
  onChange,
}: {
  value: SimulatorInput;
  onChange: (next: SimulatorInput) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const read = useCallback(
    async (file: File) => {
      setBusy(true);
      setError(null);
      setNote(null);
      try {
        const imported = await readMedicalPdf(file);
        onChange(applyPdfImport(value, imported));
        const filled = imported.matches.filter((m) => m.key !== "extra").length;
        const added = imported.matches.filter((m) => m.key === "extra").length;
        setNote(
          `Read ${imported.valueCount} value${imported.valueCount === 1 ? "" : "s"} from ${file.name} — ${filled} filled an existing box, ${added} added as a new field. Check them before running.`
        );
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "The PDF could not be read.");
      } finally {
        setBusy(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [onChange, value]
  );

  return (
    <div className="mt-3 rounded-xl border border-line bg-surface/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-2">
            Upload a medical PDF
          </p>
          <p className="mt-0.5 text-[11px] leading-4 text-ink-3">
            Labelled values fill the boxes above; anything else becomes its own field.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className={`${ghostButtonClass} shrink-0 disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {busy ? "Reading…" : "Choose PDF"}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        aria-label="Upload a medical PDF"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void read(file);
        }}
      />
      {error ? (
        <p role="alert" className="mt-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-2 text-[12px] leading-4 text-rose-300">
          {error}
        </p>
      ) : null}
      {note ? (
        <p role="status" className="mt-2 text-[12px] leading-4 text-brand-text">
          {note}
        </p>
      ) : null}
    </div>
  );
}

/* ---- the sources behind a medicine's numbers -------------------------- */

const PARAMETER_LABELS: Record<string, string> = {
  ka_per_h: "absorption rate",
  f_bioavailability: "bioavailability",
  cl_l_per_h_per_kg: "clearance",
  v_l_per_kg: "volume of distribution",
  dose_min_mg: "dose range from",
  dose_max_mg: "dose range to",
  t_half_h: "half-life",
  t_max_h: "time to peak",
};

const PARAMETER_ORDER = [
  "ka_per_h",
  "f_bioavailability",
  "cl_l_per_h_per_kg",
  "v_l_per_kg",
  "dose_min_mg",
  "dose_max_mg",
  "t_half_h",
  "t_max_h",
];

/**
 * Where each of a medicine's numbers came from.
 *
 * Every value is listed with the document that states it, so a number is never
 * just a number. A citation that covers the whole row rather than one value
 * says so, instead of pretending to be more specific than it is.
 */
function Sources({ citations }: { citations?: DrugParameterCitation[] }) {
  const [open, setOpen] = useState(false);
  if (!citations || citations.length === 0) return null;
  const ordered = [...citations].sort(
    (a, b) =>
      PARAMETER_ORDER.indexOf(a.parameter) - PARAMETER_ORDER.indexOf(b.parameter)
  );
  const documents = new Set(citations.map((c) => c.sourceUrl));

  return (
    <div className="mt-2 border-t border-line pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3 transition-colors duration-150 hover:text-brand-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none"
      >
        {open ? "hide sources" : `sources (${documents.size} document${documents.size === 1 ? "" : "s"})`}
      </button>
      {open ? (
        <ul className="mt-2 space-y-2">
          {ordered.map((citation) => (
            <li key={citation.parameter} className="text-[12px] leading-4 text-ink-2">
              <span className="font-mono text-[11px] text-ink">
                {PARAMETER_LABELS[citation.parameter] ?? citation.parameter}
              </span>
              {citation.value != null ? (
                <span className="ml-1.5 font-mono text-[11px] text-brand-text">{citation.value}</span>
              ) : null}
              <span className="ml-1.5 text-ink-3">
                {citation.sourceKind === "other" ? "cited at document level" : "· cited"}
                {citation.population ? ` · ${citation.population}` : ""}
              </span>
              <a
                href={citation.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-0.5 block truncate text-ink-3 underline decoration-line-strong underline-offset-2 transition-colors duration-150 hover:text-brand-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                {citation.sourceTitle || citation.sourceUrl}
              </a>
              <q className="mt-0.5 block text-[11px] leading-4 text-ink-3"> {citation.sourceQuote} </q>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/* ---- one medicine's card ------------------------------------------------- */

function DrugCard({
  drug,
  index,
  tEndH,
  onPatch,
  onLoadScript,
  onRemove,
  citations,
}: {
  drug: DrugLine;
  index: number;
  tEndH: number;
  onPatch: (patch: Partial<DrugLine>) => void;
  /** Applies a parsed script: the parent widens the shared window if needed. */
  onLoadScript: (doses: DoseRow[], neededWindowH: number) => void;
  onRemove: () => void;
  /** The citation behind each of this medicine's parameter values. */
  citations?: DrugParameterCitation[];
}) {
  const [script, setScript] = useState("");
  const [note, setNote] = useState<string | null>(null);

  /** The per-drug prescription: a loader into this card's dose rows. */
  const loadScript = useCallback(() => {
    const parsed = parsePrescription(script);
    if (!parsed.ok) {
      setNote(parsed.error);
      return;
    }
    onLoadScript(parsed.doses, parsed.tEndH);
    setNote(
      `Loaded ${parsed.doses.length} dose${parsed.doses.length === 1 ? "" : "s"} for this medicine.`
    );
  }, [script, onLoadScript]);

  /** The lowest studied bound this drug has; a dose below it is allowed
      with a visible warning, never blocked. */
  const belowMin =
    drug.doseRange?.[0] ?? null;
  const anyBelow =
    belowMin != null &&
    drug.doses.some((r) => {
      const dose = Number(r.doseMg);
      return r.doseMg.trim() !== "" && Number.isFinite(dose) && dose > 0 && dose < belowMin;
    });

  const rangeHint = drug.doseRange
    ? `studied range ${drug.doseRange[0]}–${drug.doseRange[1]} mg`
    : "no studied range on file";

  return (
    <div className="rounded-xl border border-line bg-surface/40 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-medium text-ink">{drug.name}</p>
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">{rangeHint}</p>
          {!isValidated(drug.drugId) ? (
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-amber-400/80">
              Not validated against a published curve
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="relative shrink-0 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-3 transition-colors duration-150 after:absolute after:-inset-2.5 after:content-[''] hover:text-rose-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none"
          aria-label={`Remove ${drug.name}`}
        >
          ×
        </button>
      </div>

      {anyBelow === true ? (
        <p
          role="alert"
          className="mt-2 rounded-lg border border-amber-400/40 bg-amber-500/10 px-2.5 py-1.5 text-[12px] leading-4 text-amber-200/90"
        >
          Below the lower bound this source studied — allowed, but outside what the evidence covers.
        </p>
      ) : null}

      {/* Script loader for this medicine */}
      <div className="mt-2 flex gap-2">
        <label className="sr-only" htmlFor={`script-${index}`}>
          Prescription script for {drug.name}
        </label>
        <input
          id={`script-${index}`}
          type="text"
          value={script}
          onChange={(event) => {
            setScript(event.target.value);
            setNote(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              loadScript();
            }
          }}
          placeholder="200 mg every 8 h for 3 doses"
          className={`${smallInputClass} w-full min-w-0 flex-1`}
        />
        <button type="button" onClick={loadScript} className={`${ghostButtonClass} shrink-0`}>
          Load
        </button>
      </div>
      <Sources citations={citations} />

      {note ? (
        <p className={`mt-1.5 text-[12px] leading-4 ${note.startsWith("Loaded") ? "text-ink-2" : "text-rose-400"}`}>
          {note}
        </p>
      ) : null}

      {/* This medicine's dose rows */}
      <div className="mt-2 space-y-1.5">
        {drug.doses.map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-9 shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
              d{i + 1}
            </span>
            <label className="sr-only" htmlFor={`dose-${index}-${i}`}>
              {drug.name} dose {i + 1} amount in milligrams
            </label>
            <input
              id={`dose-${index}-${i}`}
              type="number"
              step={1}
              inputMode="numeric"
              value={row.doseMg}
              onChange={(event) =>
                onPatch({
                  doses: drug.doses.map((r, j) =>
                    j === i ? { ...r, doseMg: event.target.value } : r
                  ),
                })
              }
              className={`${smallInputClass} w-24`}
            />
            <span className="shrink-0 font-mono text-[11px] text-ink-3">
              mg{row.doseFromPdf ? " · PDF" : ""}
            </span>
            <label className="sr-only" htmlFor={`time-${index}-${i}`}>
              {drug.name} dose {i + 1} time in hours
            </label>
            <input
              id={`time-${index}-${i}`}
              type="number"
              step={0.5}
              inputMode="decimal"
              value={row.timeH}
              onChange={(event) =>
                onPatch({
                  doses: drug.doses.map((r, j) =>
                    j === i ? { ...r, timeH: event.target.value } : r
                  ),
                })
              }
              className={`${smallInputClass} w-24`}
            />
            <span className="shrink-0 font-mono text-[11px] text-ink-3">
              h{row.timeFromPdf ? " · PDF" : ""}
            </span>
            {drug.doses.length > 1 ? (
              <button
                type="button"
                onClick={() => onPatch({ doses: drug.doses.filter((_, j) => j !== i) })}
                className="relative shrink-0 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-3 transition-colors duration-150 after:absolute after:-inset-3.5 after:content-[''] hover:text-rose-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none"
                aria-label={`Remove ${drug.name} dose ${i + 1}`}
              >
                ×
              </button>
            ) : null}
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            onPatch({
              doses: [
                ...drug.doses,
                {
                  timeH: String(Math.min(tEndH, Number(drug.doses[drug.doses.length - 1]?.timeH ?? 0) + 6)),
                  doseMg: "0",
                },
              ],
            })
          }
          className={`${ghostButtonClass} mt-1`}
        >
          + dose
        </button>
      </div>
    </div>
  );
}
