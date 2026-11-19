"use client";

/**
 * Read a medical PDF and pull the values out of it.
 *
 * The app is a static site, so this all runs in the browser. `pdfjs-dist` is
 * loaded lazily (only when someone uploads a file) and the worker is served
 * from /public, which works both on the dev server and on a static export with
 * a base path.
 *
 * This is a text extractor, not a clinical reader: it finds labelled numbers
 * ("Weight: 72 kg", "Creatinine 1.1 (0.6–1.3) mg/dL"). It never invents a
 * value, and if the document has no extractable text it says so plainly.
 */

export type PdfFieldKey =
  | "ageYears"
  | "weightKg"
  | "doseMg"
  | "timeH"
  | "tEndH"
  | "extra";

export type PdfFieldMatch = {
  /** Which simulator input this value maps to, or "extra" for a new box. */
  key: PdfFieldKey;
  /** Stable id for a new box (only set when key === "extra"). */
  extraKey?: string;
  /** The name as it appeared in the document. */
  name: string;
  /** The extracted number, as text (kept as text so an empty box stays empty). */
  value: string;
  unit?: string;
  range?: string;
  raw: string;
};

export type PdfImportResult = {
  matches: PdfFieldMatch[];
  /** How many labelled numbers were found before mapping. */
  valueCount: number;
  /** A short excerpt, so the panel can show what was read. */
  preview: string;
};

const WORKER_PATH = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/pdf.worker.min.mjs`;

/** Aliases for the boxes the simulator already has. */
const FIELD_ALIASES: Record<Exclude<PdfFieldKey, "extra">, string[]> = {
  ageYears: ["age", "patient age", "age years", "age yrs"],
  weightKg: ["weight", "body weight", "patient weight", "weight kg", "body mass"],
  doseMg: ["dose", "dose mg", "dose amount", "amount", "administered dose", "mg dose", "dose administered"],
  timeH: ["time", "time h", "time hours", "hour", "administration time", "dose time", "time point"],
  tEndH: ["duration", "window", "simulation window", "time window", "observation period"],
};

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchField(name: string): Exclude<PdfFieldKey, "extra"> | null {
  const clean = normalize(name);
  for (const key of Object.keys(FIELD_ALIASES) as Array<Exclude<PdfFieldKey, "extra">>) {
    if (FIELD_ALIASES[key].some((alias) => normalize(alias) === clean)) return key;
  }
  return null;
}

type LooseValue = {
  name: string;
  value: string;
  unit?: string;
  range?: string;
  raw: string;
};

/**
 * Pull labelled numbers out of plain text.
 *
 * A line is considered a value when it has a short label followed by a number,
 * optionally a unit and optionally a reference range in brackets or after the
 * word "normal"/"reference"/"range". Both `Weight: 70 kg` and a table row
 * `Serum creatinine 1.1 (0.6 - 1.3) mg/dL` are covered.
 */
function extractValues(text: string): LooseValue[] {
  const values: LooseValue[] = [];
  const seen = new Set<string>();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length < 3 || line.length > 240) continue;

    // A label, then a separator, then the first number on the line.
    const head = /^([A-Za-z][A-Za-z0-9 \/()%\-]{1,60}?)\s*[:=\-–]\s*(-?\d+(?:[.,]\d+)?)/.exec(line)
      ?? /^([A-Za-z][A-Za-z0-9 \/()%\-]{1,60}?)\s{2,}(-?\d+(?:[.,]\d+)?)/.exec(line);
    if (!head) continue;

    const name = head[1].replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
    const value = head[2].replace(",", ".");
    if (name.length < 2) continue;

    // Unit: a short token right after the number, but not a range dash.
    const afterNumber = line.slice(head[0].length);
    const unitMatch = /^\s*([A-Za-z%][A-Za-z0-9\/%^.]*)/.exec(afterNumber);
    const unit = unitMatch?.[1]?.slice(0, 24);

    // Reference range: "0.6 - 1.3", "0.6–1.3", "range 0.6 to 1.3", "(60-100)".
    const rangeMatch =
      /(?:(?:normal|reference|ref|range|expected)\s*)?\(?\s*(-?\d+(?:[.,]\d+)?)\s*(?:-|–|—|to)\s*(-?\d+(?:[.,]\d+)?)\s*([A-Za-z%][A-Za-z0-9\/%^.]*)?\)?/i.exec(
        afterNumber
      );
    const range = rangeMatch
      ? `${rangeMatch[1].replace(",", ".")}–${rangeMatch[2].replace(",", ".")}${
          rangeMatch[3] ? ` ${rangeMatch[3]}` : unit ? ` ${unit}` : ""
        }`
      : undefined;

    const key = `${normalize(name)}|${value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    values.push({ name, value, unit, range, raw: line });
  }
  return values;
}

/**
 * Read the given PDF. Rejects with a clear, human-readable error when the file
 * is not a PDF, cannot be opened, or holds no extractable text.
 */
export async function readMedicalPdf(file: File): Promise<PdfImportResult> {
  const looksLikePdf =
    file.type === "application/pdf" ||
    /\.pdf$/i.test(file.name);
  if (!looksLikePdf) {
    throw new Error("That file is not a PDF. Choose a medical report saved as .pdf.");
  }

  let pdfjs: typeof import("pdfjs-dist/build/pdf.mjs");
  try {
    pdfjs = await import("pdfjs-dist/build/pdf.mjs");
  } catch {
    throw new Error("The PDF reader could not be loaded. Try again in a moment.");
  }

  let text = "";
  try {
    pdfjs.GlobalWorkerOptions.workerSrc = WORKER_PATH;
    const bytes = await file.arrayBuffer();
    // `data` accepts a Uint8Array; `useSystemFonts` avoids a font fetch for
    // documents whose fonts are not embedded.
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
    const pageText: string[] = [];
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
      const page = await pdf.getPage(pageNo);
      const content = await page.getTextContent();
      const parts = content.items.map((item) => item.str ?? "");
      pageText.push(parts.join(" "));
    }
    await pdf.destroy();
    text = pageText.join("\n");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`The PDF could not be read. ${detail}`.trim());
  }

  if (!text || text.trim().length < 4) {
    throw new Error(
      "No readable text was found in this PDF. It may be an image or a scan — use a text-based report."
    );
  }

  const loose = extractValues(text);
  if (loose.length === 0) {
    throw new Error(
      "The PDF opened, but no labelled values could be pulled out. Check that it is a text-based report."
    );
  }

  const matches: PdfFieldMatch[] = loose.map((item, index) => {
    const key = matchField(item.name);
    return {
      key: key ?? "extra",
      ...(key ? {} : { extraKey: `pdf_${index}_${normalize(item.name).replace(/\s+/g, "_")}` }),
      name: item.name,
      value: item.value,
      unit: item.unit,
      range: item.range,
      raw: item.raw,
    };
  });

  return {
    matches,
    valueCount: loose.length,
    preview: text.replace(/\s+/g, " ").trim().slice(0, 240),
  };
}
