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
import { CONDITIONS } from "./condition";
import { parsePrescription } from "./prescription";
import { getApprovedPk, searchCatalogue } from "@/lib/catalogue";
import type { DrugParameterCitation } from "@dib/data-client";
import { isValidated } from "@/lib/validation-status";

export type DoseRow = {
  timeH: number;
  doseMg: number;
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
  ageYears: number;
  weightKg: number;
  sex: "female" | "male" | "other";
  drugs: DrugLine[];
  tEndH: number;
};

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
    if (!Number.isInteger(value.ageYears) || value.ageYears < 1 || value.ageYears > 120) {
      return "Age must be a whole number between 1 and 120.";
    }
    if (!Number.isFinite(value.weightKg) || value.weightKg <= 0 || value.weightKg >= 400) {
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
      if (
        drug.doseRange &&
        drug.doses.some((r) => Number.isFinite(r.doseMg) && r.doseMg > (drug.doseRange as [number, number])[1])
      ) {
        return `Outside the range this source studied (${drug.name} ${drug.doseRange[0]}–${drug.doseRange[1]} mg). The model is not valid here.`;
      }
      if (drug.doses.some((r) => !Number.isFinite(r.doseMg) || r.doseMg <= 0 || r.doseMg > 10_000)) {
        return `Each ${drug.name} dose must be a number greater than 0 and at most 10,000 mg.`;
      }
      if (drug.doses.some((r) => !Number.isFinite(r.timeH) || r.timeH < 0 || r.timeH > value.tEndH)) {
        return `Each ${drug.name} dose time must be between 0 and ${value.tEndH} h — the simulated window.`;
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

      {/* Medicines */}
      <div>
        <span className={fieldLabel}>Medicines</span>
        <DrugSearch
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
        <p className="mt-2 text-[12px] leading-4 text-ink-3">
          From the catalogue, not from free text. A medicine is addable only when its
          pharmacokinetics are sourced and cited — up to {MAX_DRUGS} in one treatment.
        </p>

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
                      ? { ...d, doses: doses.map((r) => ({ ...r, timeH: Math.min(r.timeH, tEndH) })) }
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
          Only weight moves the curve: each medicine's volume and clearance scale with body weight.
        </p>
      </div>

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
                  doses: d.doses.map((r) => ({ ...r, timeH: Math.min(r.timeH, next) })),
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
  selectedIds,
  full,
  onAdd,
}: {
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
  const add = (hit: CatalogueHit) => {
    setOpen(false);
    setQuery("");
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
    belowMin != null && drug.doses.some((r) => Number.isFinite(r.doseMg) && r.doseMg > 0 && r.doseMg < belowMin);

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
              min={1}
              max={10000}
              step={1}
              value={row.doseMg}
              onChange={(event) =>
                onPatch({
                  doses: drug.doses.map((r, j) =>
                    j === i ? { ...r, doseMg: Number(event.target.value) } : r
                  ),
                })
              }
              className={`${smallInputClass} w-24`}
              aria-invalid={!Number.isFinite(row.doseMg) || row.doseMg <= 0 || row.doseMg > 10_000}
            />
            <span className="shrink-0 font-mono text-[11px] text-ink-3">mg</span>
            <label className="sr-only" htmlFor={`time-${index}-${i}`}>
              {drug.name} dose {i + 1} time in hours
            </label>
            <input
              id={`time-${index}-${i}`}
              type="number"
              min={0}
              max={tEndH}
              step={0.5}
              value={row.timeH}
              onChange={(event) =>
                onPatch({
                  doses: drug.doses.map((r, j) =>
                    j === i ? { ...r, timeH: Number(event.target.value) } : r
                  ),
                })
              }
              className={`${smallInputClass} w-24`}
              aria-invalid={!Number.isFinite(row.timeH) || row.timeH < 0 || row.timeH > tEndH}
            />
            <span className="shrink-0 font-mono text-[11px] text-ink-3">h</span>
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
                  timeH: Math.min(tEndH, (drug.doses[drug.doses.length - 1]?.timeH ?? 0) + 6),
                  doseMg: drug.doses[drug.doses.length - 1]?.doseMg ?? 100,
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
