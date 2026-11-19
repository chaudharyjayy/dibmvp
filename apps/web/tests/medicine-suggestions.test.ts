import { describe, expect, it } from "vitest";

import {
  SUGGESTED_MEDICINES,
  suggestionsFor,
} from "../components/simulator/medicine-suggestions";

/** The five medicines with a sourced, approved PK row in the catalogue. */
const PK_BACKED_IDS = [
  "acetaminophen",
  "ibuprofen",
  "amoxicillin",
  "gabapentin",
  "caffeine",
];

describe("medicine suggestions for a condition", () => {
  it("only suggests medicines that have a sourced PK row", () => {
    for (const list of Object.values(SUGGESTED_MEDICINES)) {
      for (const medicine of list) {
        expect(PK_BACKED_IDS).toContain(medicine.id);
        expect(medicine.name.length).toBeGreaterThan(0);
      }
    }
  });

  it("offers the common examples for the conditions that have them", () => {
    expect(suggestionsFor("pain-fever").map((m) => m.id)).toEqual([
      "acetaminophen",
      "ibuprofen",
    ]);
    expect(suggestionsFor("infection").map((m) => m.id)).toEqual(["amoxicillin"]);
    expect(suggestionsFor("neuro").map((m) => m.id)).toEqual(["gabapentin"]);
  });

  it("stays empty rather than inventing a medicine for other conditions", () => {
    for (const id of ["diabetes", "hypertension", "asthma", "liver", "kidney"]) {
      expect(suggestionsFor(id)).toEqual([]);
    }
    expect(suggestionsFor("unknown-condition")).toEqual([]);
  });

  it("returns a copy so a caller cannot change the shared table", () => {
    const first = suggestionsFor("pain-fever");
    first.pop();
    expect(suggestionsFor("pain-fever")).toHaveLength(2);
  });
});
