import { describe, expect, it } from "vitest";
import {
  CONDITIONS,
  conditionById,
  levelsFor,
  momentAt,
  narrate,
  organsFor,
} from "../components/simulator/condition";

/**
 * The simulator's words are the product's only claim about what the model
 * does, so these tests pin the two properties that matter: every number in
 * the narration is the engine's own, and no step claims a drug treats
 * anything.
 */
describe("conditions", () => {
  it("falls back to the general condition for an unknown id", () => {
    expect(conditionById("nope").id).toBe("general");
  });

  it("gives every condition at least one organ to visit", () => {
    for (const condition of CONDITIONS) {
      expect(organsFor(condition).length).toBeGreaterThan(0);
    }
  });

  it("only visits organs the model can actually show", () => {
    const known = new Set(["brain", "heart", "lungs", "liver", "kidneys", "gut"]);
    for (const condition of CONDITIONS) {
      for (const organ of organsFor(condition)) {
        expect(known.has(organ)).toBe(true);
      }
    }
  });
});

describe("narrate", () => {
  const moment = {
    hours: 3,
    gutMg: 40,
    bodyMg: 160,
    concMgPerL: 2.5,
    eliminationMgPerH: 12,
  };

  it("quotes the engine's numbers and nothing else", () => {
    for (const condition of CONDITIONS) {
      for (const organ of organsFor(condition)) {
        const text = narrate(organ, moment, condition);
        const body = `${text.title} ${text.body} ${text.figures
          .map((f) => `${f.label} ${f.value}`)
          .join(" ")}`;
        // Every number in the text must be one of the engine's.
        const numbers = body.match(/\d+\.?\d*/g) ?? [];
        const allowed = new Set([
          "3",
          "40",
          "160",
          "2.5",
          "12",
          "0.0",
          "1",
          "2",
        ]);
        for (const raw of numbers) {
          const value = Number(raw);
          const known = [...allowed].some((a) => Math.abs(Number(a) - value) < 0.001);
          expect(known).toBe(true);
        }
      }
    }
  });

  it("never claims the drug treats the condition", () => {
    const condition = conditionById("asthma");
    const text = narrate("lungs", moment, condition);
    expect(text.body).not.toMatch(/treat/i);
    expect(text.body).not.toMatch(/cure/i);
    expect(text.body).not.toMatch(/works for/i);
  });

  it("says the model cannot judge the disease layer", () => {
    const condition = conditionById("neuro");
    const text = narrate("brain", moment, condition);
    expect(text.body).toMatch(/cannot say whether/i);
  });

  it("opens on the whole body, with the run's own numbers", () => {
    const condition = conditionById("general");
    const text = narrate(null, moment, condition);
    expect(text.organ).toBeNull();
    expect(text.body).toContain("160.0 mg");
    expect(text.body).toContain("2.500 mg/L");
    expect(text.figures.map((f) => f.value)).toEqual(["2.500 mg/L", "160.0 mg"]);
  });
});

describe("levelsFor", () => {
  const peaks = { concMgPerL: 10, eliminationMgPerH: 8 };

  it("drives the blood organs from the concentration", () => {
    const levels = levelsFor(
      { hours: 1, gutMg: 0, bodyMg: 100, concMgPerL: 5, eliminationMgPerH: 0 },
      peaks
    );
    expect(levels.heart).toBeCloseTo(0.5, 5);
    expect(levels.lungs).toBeCloseTo(0.5, 5);
  });

  it("drives the clearance organs from the elimination rate", () => {
    const levels = levelsFor(
      { hours: 1, gutMg: 0, bodyMg: 100, concMgPerL: 10, eliminationMgPerH: 4 },
      peaks
    );
    expect(levels.liver).toBeCloseTo(0.5, 5);
    expect(levels.kidneys).toBeCloseTo(0.5, 5);
  });

  it("normalises each quantity against its own peak, not another one", () => {
    // A clearance rate is not a concentration: comparing the two would put
    // the organ at full strength when it is nowhere near it.
    const levels = levelsFor(
      { hours: 1, gutMg: 0, bodyMg: 100, concMgPerL: 1, eliminationMgPerH: 8 },
      peaks
    );
    expect(levels.liver).toBeCloseTo(1, 5);
    expect(levels.heart).toBeCloseTo(0.1, 5);
  });

  it("keeps every level inside 0..1 even at the extremes", () => {
    const levels = levelsFor(
      { hours: 1, gutMg: 1000, bodyMg: 0, concMgPerL: 99, eliminationMgPerH: 999 },
      { concMgPerL: 1, eliminationMgPerH: 1 }
    );
    for (const value of Object.values(levels)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});

describe("momentAt", () => {
  const series = {
    tH: [0, 1, 2, 3],
    gutMg: [100, 50, 20, 5],
    bodyMg: [0, 50, 80, 95],
    concMgPerL: [0, 1, 2, 3],
    eliminationMgPerH: [0, 1, 2, 3],
  };

  it("reads the sample nearest the hour asked for", () => {
    const moment = momentAt(
      series.tH,
      series.gutMg,
      series.bodyMg,
      series.concMgPerL,
      series.eliminationMgPerH,
      2.1
    );
    expect(moment.hours).toBe(2);
    expect(moment.bodyMg).toBe(80);
  });

  it("reads the first sample for an hour before the start", () => {
    const moment = momentAt(
      series.tH,
      series.gutMg,
      series.bodyMg,
      series.concMgPerL,
      series.eliminationMgPerH,
      -1
    );
    expect(moment.hours).toBe(0);
  });

  it("survives an empty series", () => {
    const moment = momentAt([], [], [], [], [], 5);
    expect(moment.hours).toBe(0);
    expect(moment.gutMg).toBe(0);
  });
});
