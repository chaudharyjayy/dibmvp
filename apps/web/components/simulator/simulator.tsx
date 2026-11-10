"use client";

import * as React from "react";
import { simulate, buildReport, type SimResult, type BodyProfile, type DoseEvent } from "@dib/engine";
import { createDataClient, type DataClient } from "@dib/data-client";
import CurveChart from "@/components/simulator/curve-chart";
import { exampleDrug, EXAMPLE_BANNER } from "@/lib/example-drug";

type SexUi = "female" | "male" | "other";
const toEngineSex = (s: SexUi): BodyProfile["sex"] => (s === "female" ? "F" : s === "male" ? "M" : "other");

const rowInput =
  "w-24 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent dark:bg-zinc-900 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/60";
const buttonPrimary =
  "rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50";
const buttonGhost =
  "rounded-xl border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50";
const card =
  "rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm";
const fieldLabel = "block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1";

interface DoseRow {
  timeH: number;
  doseMg: number;
}

export default function Simulator() {
  // ---- profile -------------------------------------------------------------
  const [ageYears, setAgeYears] = React.useState(30);
  const [weightKg, setWeightKg] = React.useState(70);
  const [sex, setSex] = React.useState<SexUi>("other");

  // ---- doses ---------------------------------------------------------------
  const [rows, setRows] = React.useState<DoseRow[]>([
    { timeH: 0, doseMg: 200 },
  ]);
  const [tEndH, setTEndH] = React.useState(48);

  // ---- session ------------------------------------------------------------
  const [client, setClient] = React.useState<DataClient | null>(null);
  const [signedInEmail, setSignedInEmail] = React.useState<string | null>(null);
  const [action, setAction] = React.useState<string | null>(null); // save / load notices
  const profileLoadedRef = React.useRef(false);

  React.useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key || key.startsWith("paste-")) return;
    let unsub: (() => void) | null = null;
    try {
      const c = createDataClient({ supabaseUrl: url, supabaseAnonKey: key });
      setClient(c);
      void c.auth.getSession().then(({ data }) => {
        if (data?.session?.email) setSignedInEmail(data.session.email);
      });
      const res = c.auth.onAuthChange((_e, session) => {
        setSignedInEmail(session?.email ?? null);
      });
      if (res.data) unsub = res.data.unsubscribe;
    } catch {
      /* the sign-in state controls saving only; simulation works regardless */
    }
    return () => unsub?.();
  }, []);

  // Pre-fill the form from the stored profile once, when signed in.
  React.useEffect(() => {
    if (!client || !signedInEmail || profileLoadedRef.current) return;
    profileLoadedRef.current = true;
    void client.profile.getProfile().then(({ data, error }) => {
      if (error || !data) return;
      setAgeYears(data.ageYears);
      setWeightKg(data.weightKg);
      setSex(data.sex);
      setAction("Profile loaded from your account.");
    });
  }, [client, signedInEmail]);

  // ---- engine -------------------------------------------------------------
  const profile: BodyProfile = { ageYears, weightKg, sex: toEngineSex(sex) };
  const inputValid =
    Number.isInteger(ageYears) && ageYears >= 1 && ageYears <= 120 &&
    weightKg > 0 && weightKg < 400 &&
    rows.length >= 1 &&
    rows.every((r) => Number.isFinite(r.timeH) && r.timeH >= 0 && r.timeH <= 96 && Number.isFinite(r.doseMg) && r.doseMg >= 0 && r.doseMg <= 10_000);

  let result: SimResult | null = null;
  let simError: string | null = null;
  if (inputValid) {
    const doses: DoseEvent[] = rows.map((r) => ({ drugId: exampleDrug.id, doseMg: r.doseMg, timeH: r.timeH }));
    try {
      result = simulate({ profile, drug: exampleDrug, doses, tEndH, dtH: 0.05 });
    } catch (e) {
      simError = e instanceof Error ? e.message : "simulation failed";
    }
  }

  const report = result ? buildReport(result) : null;

  // ---- save ---------------------------------------------------------------
  const [saving, setSaving] = React.useState(false);

  async function saveReport() {
    if (!client || !result || !report || saving) return;
    setSaving(true);
    setAction(null);
    const summaryText = report.bullets.join("\n").slice(0, 1000);
    const { data, error } = await client.reports.saveReport({
      title: `${exampleDrug.name} — ${new Date().toISOString().slice(0, 10)}`,
      profileSnapshot: { ageYears, weightKg, sex },
      drugs: rows.map((r) => ({
        drugId: exampleDrug.id,
        doseMg: r.doseMg,
        times: rows.filter((x) => x.timeH === r.timeH && x.doseMg === r.doseMg).map((x) => x.timeH),
      })).filter((d, i, arr) => arr.findIndex((y) => y.drugId === d.drugId) === i),
      metrics: {
        cmaxMgPerL: result.cmaxMgPerL,
        tmaxH: result.tmaxH,
        timeToClearH: result.timeToClearH,
      },
      warnings: rows.map((r) => ({
        pair: exampleDrug.id,
        severity: "minor" as const,
        note: result!.warnings.slice(0, 1)[0]?.slice(0, 100) ?? "",
      })),
      summary: summaryText,
      summarySource: "template",
      engineVersion: "0.1.0",
    });
    setSaving(false);
    setAction(error ? `Save failed: ${error.message}` : "Report saved to your account.");
  }

  async function saveProfileNow() {
    if (!client) return;
    setAction(null);
    const { error } = await client.profile.saveProfile({ ageYears, weightKg, sex });
    setAction(error ? `Profile save failed: ${error.message}` : "Profile saved to your account.");
  }

  // ---- render -------------------------------------------------------------
  return (
    <div className="mx-auto max-w-5xl px-6 py-10 space-y-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Simulator</h1>
        <p className="mt-2 text-sm text-amber-700 dark:text-amber-400 flex items-start gap-2">
          <span aria-hidden="true">⚠</span>
          {EXAMPLE_BANNER}
        </p>
      </header>

      {/* Profile */}
      <section className={card}>
        <h2 className="font-medium">1 · Your profile</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          The only three numbers the model needs. Age and sex are stored but not yet
          used by the model — no age/sex equation exists in the engine yet.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <div>
            <label className={fieldLabel} htmlFor="age">Age (years)</label>
            <input id="age" type="number" min={1} max={120} step={1} value={ageYears}
              onChange={(e) => setAgeYears(Number(e.target.value))} className={rowInput} />
          </div>
          <div>
            <label className={fieldLabel} htmlFor="weight">Weight (kg)</label>
            <input id="weight" type="number" min={0.5} max={399} step={0.5} value={weightKg}
              onChange={(e) => setWeightKg(Number(e.target.value))} className={rowInput} />
          </div>
          <div>
            <label className={fieldLabel} htmlFor="sex">Sex</label>
            <select id="sex" value={sex} onChange={(e) => setSex(e.target.value as SexUi)}
              className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent dark:bg-zinc-900 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/60">
              <option value="female">female</option>
              <option value="male">male</option>
              <option value="other">other</option>
            </select>
          </div>
          {client ? (
            <button onClick={() => void saveProfileNow()} className={buttonGhost}>
              Save profile to account
            </button>
          ) : null}
        </div>
      </section>

      {/* Doses */}
      <section className={card}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="font-medium">2 · {exampleDrug.name} — doses &amp; timing <span className="text-xs text-zinc-400">(test parameters)</span></h2>
          <button
            onClick={() => setRows((r) => [...r, { timeH: Math.min(96, (r[r.length - 1]?.timeH ?? 0) + 6), doseMg: 100 }])}
            className={buttonGhost}
          >
            + Add dose
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="w-16 text-xs text-zinc-500 dark:text-zinc-400">Dose {i + 1}</span>
              <label className="sr-only" htmlFor={`dose-${i}`}>Amount in mg</label>
              <input id={`dose-${i}`} type="number" min={0} max={10000} step={25} value={row.doseMg}
                onChange={(e) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, doseMg: Number(e.target.value) } : r)))}
                className={rowInput} aria-label={`Dose ${i + 1} amount in mg`} />
              <span className="text-xs text-zinc-400">mg at</span>
              <label className="sr-only" htmlFor={`time-${i}`}>Time in hours</label>
              <input id={`time-${i}`} type="number" min={0} max={96} step={0.5} value={row.timeH}
                onChange={(e) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, timeH: Number(e.target.value) } : r)))}
                className={rowInput} aria-label={`Dose ${i + 1} time in hours`} />
              <span className="text-xs text-zinc-400">h</span>
              {rows.length > 1 ? (
                <button onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="text-xs text-rose-600 hover:underline" aria-label={`Remove dose ${i + 1}`}>
                  remove
                </button>
              ) : null}
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <label className={fieldLabel} htmlFor="tend">Simulate for</label>
          <select id="tend" value={tEndH} onChange={(e) => setTEndH(Number(e.target.value))}
            className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent dark:bg-zinc-900 px-2 py-1.5 text-sm">
            <option value={12}>12 h</option>
            <option value={24}>24 h</option>
            <option value={48}>48 h</option>
            <option value={72}>72 h</option>
            <option value={96}>96 h</option>
          </select>
        </div>
      </section>

      {/* Curve + report */}
      <section className={card}>
        <h2 className="font-medium">3 · Result</h2>
        {!inputValid && (
          <p className="mt-3 text-sm text-rose-600">Fix the highlighted inputs — outside the validated ranges above, nothing runs.</p>
        )}
        {inputValid && simError && <p className="mt-3 text-sm text-rose-600">{simError}</p>}
        {result && report && (
          <div className="mt-4 grid gap-6 lg:grid-cols-[1fr,300px]">
            <CurveChart result={result} />
            <div className="space-y-3 text-sm">
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
                <p className="font-medium">{report.headline}</p>
                <ul className="mt-2 list-disc list-inside text-zinc-600 dark:text-zinc-300 space-y-1 text-xs">
                  {report.bullets.map((b, i) => <li key={i}>{b}</li>)}
                </ul>
                <p className="mt-3 text-[11px] text-zinc-400 leading-4">{report.disclaimer}</p>
              </div>
              {client && signedInEmail ? (
                <button onClick={() => void saveReport()} disabled={saving || simError != null} className={buttonPrimary}>
                  {saving ? "Saving…" : "Save report to your account"}
                </button>
              ) : (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  <a href="/signin" className="underline">Sign in</a> to save reports.
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      {action ? (
        <p role="status" className="text-sm text-zinc-500 dark:text-zinc-400">{action}</p>
      ) : null}
    </div>
  );
}
