/**
 * What a condition touches, and what the model can honestly say about it.
 *
 * The engine is a one-compartment model: a dose goes into the gut, is
 * absorbed into the blood, and is cleared at a constant rate. It does not
 * model diseases. So a condition here does not predict anything — it picks
 * which organs the walkthrough visits, and the numbers shown at each stop are
 * the engine's own.
 *
 * Kept free of React and Three.js so it can be tested on its own.
 */

import type { FocusOrgan } from "./scene";

/**
 * A condition, and the organs it is about.
 *
 * The organs are where the condition is *felt or measured*, not where a drug
 * acts. Nothing here says a drug treats a condition; the simulator does not
 * know that.
 */
export type Condition = {
  id: string;
  label: string;
  /** One line, plain, no claims. */
  blurb: string;
  /** The organs the walkthrough visits, in order. */
  organs: FocusOrgan[];
};

export const CONDITIONS: Condition[] = [
  {
    id: "general",
    label: "General — no condition",
    blurb: "A plain dose with nothing in particular to watch.",
    organs: ["gut", "heart", "liver", "kidneys"],
  },
  {
    id: "pain-fever",
    label: "Pain and fever",
    blurb: "The gut taking the dose, the blood carrying it, the liver clearing it.",
    organs: ["gut", "heart", "liver", "kidneys"],
  },
  {
    id: "infection",
    label: "Infection — antibiotics",
    blurb: "The lungs and the blood, where an infection shows.",
    organs: ["lungs", "heart", "liver", "kidneys"],
  },
  {
    id: "diabetes",
    label: "Diabetes",
    blurb: "The liver, the kidneys and the blood — glucose travels that way.",
    organs: ["liver", "heart", "kidneys"],
  },
  {
    id: "hypertension",
    label: "High blood pressure",
    blurb: "The heart and the kidneys, which share the pressure story.",
    organs: ["heart", "kidneys", "liver"],
  },
  {
    id: "asthma",
    label: "Asthma",
    blurb: "The lungs and the blood that reaches them.",
    organs: ["lungs", "heart", "liver"],
  },
  {
    id: "neuro",
    label: "Neurological — headache, epilepsy",
    blurb: "The brain, and the blood that carries the dose there.",
    organs: ["brain", "heart", "liver"],
  },
  {
    id: "liver",
    label: "Liver and digestion",
    blurb: "The liver, the gut it drains from, and the kidneys that clear what is left.",
    organs: ["liver", "gut", "kidneys"],
  },
  {
    id: "kidney",
    label: "Kidney disease",
    blurb: "The kidneys and the liver, the two clearances.",
    organs: ["kidneys", "liver", "heart"],
  },
];

/** The condition with this id, or the general one. */
export function conditionById(id: string): Condition {
  return CONDITIONS.find((c) => c.id === id) ?? CONDITIONS[0];
}

/** The organs the walkthrough visits, for a condition. */
export function organsFor(condition: Condition): FocusOrgan[] {
  return condition.organs;
}

/* ------------------------------------------------------------------ */
/* Narration                                                          */
/* ------------------------------------------------------------------ */

/** The engine's numbers at one moment. */
export type SimMoment = {
  /** Hours since the first dose. */
  hours: number;
  /** What is still sitting in the gut, in mg. */
  gutMg: number;
  /** What is in the blood, in mg. */
  bodyMg: number;
  /** Blood concentration, mg/L. */
  concMgPerL: number;
  /** How fast the body is clearing, mg/h. */
  eliminationMgPerH: number;
};

export type Narration = {
  /** The organ this step is about, or null for the whole body. */
  organ: FocusOrgan | null;
  /** The heading. */
  title: string;
  /** The paragraph under it. */
  body: string;
  /** Two or three numbers, labelled. */
  figures: Array<{ label: string; value: string }>;
};

/** What each organ is, in the model's own terms. */
const ORGAN_TITLE: Record<FocusOrgan, string> = {
  gut: "The gut — where the dose starts",
  heart: "The blood — where the dose travels",
  lungs: "The lungs — the blood that reaches them",
  liver: "The liver — the body's main clearance",
  kidneys: "The kidneys — filtering what is left",
  brain: "The brain — where the dose finally arrives",
};

/**
 * The narration for one organ at one moment.
 *
 * Every number is the engine's. The wording says what the model does, not
 * what the drug treats — the model does not know that.
 */
export function narrate(
  organ: FocusOrgan | null,
  moment: SimMoment,
  condition: Condition
): Narration {
  const f = (x: number, digits = 1) => x.toFixed(digits);

  if (!organ) {
    return {
      organ: null,
      title: "The whole body — one pool of blood",
      body:
        `The model has a single blood compartment. At ${f(moment.hours)} h it holds ` +
        `${f(moment.bodyMg)} mg, a concentration of ${f(moment.concMgPerL, 3)} mg/L, and it is ` +
        `clearing ${f(moment.eliminationMgPerH, 2)} mg/h. Everything that follows is the same ` +
        `blood seen from a different organ — the model does not say how ${condition.label.toLowerCase()} ` +
        `changes any of it.`,
      figures: [
        { label: "Concentration", value: `${f(moment.concMgPerL, 3)} mg/L` },
        { label: "In the blood", value: `${f(moment.bodyMg)} mg` },
      ],
    };
  }

  switch (organ) {
    case "gut": {
      const absorbed = moment.bodyMg;
      return {
        organ,
        title: ORGAN_TITLE.gut,
        body:
          `The dose goes into the gut as a depot. Absorbed so far: ${f(absorbed)} mg. ` +
          `Still waiting to be taken up: ${f(moment.gutMg)} mg. ` +
          `The gut itself is not part of this model — the camera frames the abdomen ` +
          `where it sits — and nothing here depends on ${condition.label.toLowerCase()}. ` +
          `The model only moves the dose along.`,
        figures: [
          { label: "In the gut", value: `${f(moment.gutMg)} mg` },
          { label: "Absorbed", value: `${f(absorbed)} mg` },
        ],
      };
    }
    case "heart":
      return {
        organ,
        title: ORGAN_TITLE.heart,
        body:
          `The absorbed dose is now in the blood: ${f(moment.bodyMg)} mg, a concentration of ` +
          `${f(moment.concMgPerL, 3)} mg/L at ${f(moment.hours)} h. ` +
          `The heart is drawn here because it is the blood's route through the chest, ` +
          `not because the model predicts anything about ${condition.label.toLowerCase()}.`,
        figures: [
          { label: "Concentration", value: `${f(moment.concMgPerL, 3)} mg/L` },
          { label: "In the blood", value: `${f(moment.bodyMg)} mg` },
        ],
      };
    case "lungs":
      return {
        organ,
        title: ORGAN_TITLE.lungs,
        body:
          `The lungs are perfused by the same blood as everything else, so they carry the ` +
          `same ${f(moment.concMgPerL, 3)} mg/L. The model has no separate lung compartment — ` +
          `it is one blood pool. What is drawn is where the drug passes.`,
        figures: [
          { label: "Blood concentration", value: `${f(moment.concMgPerL, 3)} mg/L` },
          { label: "At", value: `${f(moment.hours)} h` },
        ],
      };
    case "liver":
      return {
        organ,
        title: ORGAN_TITLE.liver,
        body:
          `The liver is the body's main clearance, and here it is working: ` +
          `${f(moment.eliminationMgPerH, 2)} mg/h is being removed from the blood at ` +
          `${f(moment.hours)} h. The model applies one clearance rate to the whole body, ` +
          `so this is the total, not a liver-specific figure.`,
        figures: [
          { label: "Clearing", value: `${f(moment.eliminationMgPerH, 2)} mg/h` },
          { label: "In the blood", value: `${f(moment.bodyMg)} mg` },
        ],
      };
    case "kidneys":
      return {
        organ,
        title: ORGAN_TITLE.kidneys,
        body:
          `The kidneys filter what the liver has already cleared. The model runs a single ` +
          `clearance term, so ${f(moment.eliminationMgPerH, 2)} mg/h is leaving the blood in total ` +
          `rather than being split between the two organs.`,
        figures: [
          { label: "Total clearance", value: `${f(moment.eliminationMgPerH, 2)} mg/h` },
          { label: "In the blood", value: `${f(moment.bodyMg)} mg` },
        ],
      };
    case "brain":
    default:
      return {
        organ: "brain",
        title: ORGAN_TITLE.brain,
        body:
          `The brain is supplied by the same blood, so it sees the same ` +
          `${f(moment.concMgPerL, 3)} mg/L at ${f(moment.hours)} h. The model has no brain ` +
          `compartment and no blood–brain barrier; it does not say whether a dose reaches ` +
          `brain tissue, and it cannot say whether the drug helps ${condition.label.toLowerCase()}.`,
        figures: [
          { label: "Blood concentration", value: `${f(moment.concMgPerL, 3)} mg/L` },
          { label: "At", value: `${f(moment.hours)} h` },
        ],
      };
  }
}

/**
 * The organ levels to draw, from one moment of the simulation.
 *
 * Each quantity is normalised against its own maximum over the run: the
 * blood against the peak concentration, the clearance against the peak
 * clearance. Comparing a clearance rate with a concentration would be
 * comparing two different things, and the organ would read full when it was
 * not.
 *
 * The gut has no level here: it is not in the model. Its number is in the
 * narration, and the camera frames the abdomen.
 */
export function levelsFor(
  moment: SimMoment,
  peaks: { concMgPerL: number; eliminationMgPerH: number }
): Record<string, number> {
  const blood = Math.min(1, moment.concMgPerL / Math.max(peaks.concMgPerL, 1e-9));
  const clearance = Math.min(
    1,
    moment.eliminationMgPerH / Math.max(peaks.eliminationMgPerH, 1e-9)
  );

  return {
    // The blood group: the heart, the lungs, the vessels.
    heart: blood,
    lungs: blood,
    // Clearance: the liver and the kidneys.
    liver: clearance,
    kidneys: clearance,
  };
}

/**
 * Reads the engine's series at one hour.
 *
 * The engine integrates at a fixed step, so the nearest sample is used.
 */
export function momentAt(
  tH: number[],
  gutMg: number[],
  bodyMg: number[],
  concMgPerL: number[],
  eliminationMgPerH: number[],
  hours: number
): SimMoment {
  if (tH.length === 0) {
    return { hours: 0, gutMg: 0, bodyMg: 0, concMgPerL: 0, eliminationMgPerH: 0 };
  }
  let index = 0;
  let best = Infinity;
  for (let i = 0; i < tH.length; i += 1) {
    const delta = Math.abs(tH[i] - hours);
    if (delta < best) {
      best = delta;
      index = i;
    }
  }
  return {
    hours: tH[index],
    gutMg: gutMg[index] ?? 0,
    bodyMg: bodyMg[index] ?? 0,
    concMgPerL: concMgPerL[index] ?? 0,
    eliminationMgPerH: eliminationMgPerH[index] ?? 0,
  };
}
