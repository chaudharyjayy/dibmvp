/**
 * A prescription, as the visitor would write it, parsed into a dose schedule.
 *
 * The grammar is deliberately small — the phrases a prescription slip uses:
 *
 *     200 mg every 8 h for 3 doses
 *     500 mg once
 *     100 mg at 0, 6, 12, 18
 *     250 mg q6h x4
 *
 * The parser never invents pharmacology. It only places amounts at times; the
 * drug stays the labelled example and the schedule it loads stays visible and
 * editable in the dose rows, which remain the source of truth for the engine.
 */

import type { DoseRow } from "./console";

export type ParsedPrescription =
  | { ok: true; doses: DoseRow[]; tEndH: number }
  | { ok: false; error: string };

/** The windows the panel offers; the smallest one that covers the script. */
const WINDOWS = [12, 24, 48, 72];

function amountFrom(text: string): number | null {
  const match = text.match(/(\d+(?:\.\d+)?)\s*(?:mg|milligram)/i);
  if (!match) return null;
  const amount = Number(match[1]);
  return amount > 0 ? amount : null;
}

function intervalFrom(text: string): number | null {
  // "every 8 hours" / "every 8h" / "q8h" / "q 8 h"
  const every = text.match(/every\s+(\d+(?:\.\d+)?)\s*(?:h\b|hour)/i);
  if (every) {
    const interval = Number(every[1]);
    if (interval > 0) return interval;
  }
  const latin = text.match(/\bq\s*(\d+(?:\.\d+)?)\s*h\b/i);
  if (latin) {
    const interval = Number(latin[1]);
    if (interval > 0) return interval;
  }
  return null;
}

function countFrom(text: string): number | null {
  // "x3", "×3", "for 3 doses". The x needs no trailing word boundary:
  // in "x3" the character after x is a digit, which would break \bx\b.
  const times = text.match(/(?:\bx|×|for)\s*(\d{1,3})\s*(?:doses?)?/i);
  if (times) {
    const count = Number(times[1]);
    if (count > 0 && count <= 100) return count;
  }
  const doses = text.match(/(\d{1,3})\s*doses?/i);
  if (doses) {
    const count = Number(doses[1]);
    if (count > 0 && count <= 100) return count;
  }
  if (/\bonce\b/i.test(text)) return 1;
  return null;
}

/** "at 0, 6, 12 and 18" → [0, 6, 12, 18]. */
function timesFrom(text: string): number[] | null {
  const match = text.match(/\bat\s+([\d.,\s]+and[\d.,\s]+|[\d.,\s]+)/i);
  if (!match) return null;
  const numbers = match[1]
    .split(/[,\s]+and[,\s]+|[,\s]+/)
    .map((part) => Number(part))
    .filter((n) => Number.isFinite(n) && n >= 0);
  if (numbers.length === 0) return null;
  return numbers;
}

function windowFor(lastTimeH: number): number {
  return WINDOWS.find((window) => lastTimeH <= window) ?? WINDOWS[WINDOWS.length - 1];
}

export function parsePrescription(text: string): ParsedPrescription {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, error: "Write the prescription first — e.g. 200 mg every 8 h for 3 doses." };
  }

  const amount = amountFrom(trimmed);
  if (amount === null) {
    return { ok: false, error: "No amount found — write it with mg, e.g. 200 mg every 8 h." };
  }

  // Explicit times win: "100 mg at 0, 6, 12".
  const times = timesFrom(trimmed);
  if (times) {
    const doses = times.map((timeH) => ({ timeH, doseMg: amount }));
    const last = Math.max(...times);
    return { ok: true, doses, tEndH: windowFor(last) };
  }

  const interval = intervalFrom(trimmed);
  const count = countFrom(trimmed);

  // "500 mg once", or an amount alone: one dose at the start.
  if (interval === null || count === null) {
    if (/\bonce\b/i.test(trimmed) || (interval === null && count === null)) {
      return { ok: true, doses: [{ timeH: 0, doseMg: amount }], tEndH: 12 };
    }
    if (interval !== null && count === null) {
      return {
        ok: false,
        error: "How many doses? Add “for 3 doses” or “x3”.",
      };
    }
    return {
      ok: false,
      error: "How far apart? Add “every 8 h” or “q8h”, or list times: “at 0, 6, 12”.",
    };
  }

  if (amount * count > 100_000 || count > 100) {
    return { ok: false, error: "That is more than the panel can draw — keep it under 100 doses." };
  }

  const doses: DoseRow[] = Array.from({ length: count }, (_, index) => ({
    timeH: Math.round(index * interval * 2) / 2,
    doseMg: amount,
  }));
  const last = doses[doses.length - 1].timeH;
  return { ok: true, doses, tEndH: windowFor(last) };
}
