import { describe, it, expect } from 'vitest';
import { simulate, assessToxicity, FAILURE_THRESHOLD } from '../index';
import { fixtureDrug } from './fixtures/fixtureDrug';
import type { BodyProfile, DoseEvent } from '../types';

const profile: BodyProfile = { ageYears: 30, weightKg: 70, sex: 'M' };

describe('synthetic toxicity / organ failure', () => {
  it('a dose within the studied range causes no failure and no death', () => {
    const result = simulate({
      profile,
      drug: fixtureDrug,
      doses: [{ drugId: fixtureDrug.id, doseMg: 100, timeH: 0 }],
      tEndH: 24,
      dtH: 0.05,
    });
    expect(result.toxicity).toBeDefined();
    expect(result.toxicity!.failedOrgans).toHaveLength(0);
    expect(result.toxicity!.death).toBeNull();
    expect(result.toxicity!.message).toBeNull();
  });

  it('attaches toxicity to the simulate result from the same inputs', () => {
    const doses: DoseEvent[] = [{ drugId: fixtureDrug.id, doseMg: 100, timeH: 0 }];
    const input = { profile, drug: fixtureDrug, doses, tEndH: 24, dtH: 0.05 };
    const result = simulate(input);
    expect(result.toxicity).toEqual(assessToxicity(input, result));
  });

  it('a massive dose fails a vital organ and kills the model with a named message', () => {
    // Studied ceiling is 500 mg; 6000 mg is 12x -> well past the threshold.
    const result = simulate({
      profile,
      drug: fixtureDrug,
      doses: [{ drugId: fixtureDrug.id, doseMg: 6000, timeH: 2.5 }],
      tEndH: 24,
      dtH: 0.05,
    });
    const tox = result.toxicity!;
    expect(tox.failedOrgans.length).toBeGreaterThan(0);
    expect(tox.death).not.toBeNull();
    expect(tox.message).toContain('Heart');
    expect(tox.message).toContain(fixtureDrug.name);
    expect(tox.message).toContain('6000');
    expect(tox.death!.organ).toBe('heart');
    expect(tox.death!.timeH).toBe(2.5);
  });

  it('organ load never stays below a failure load once that organ has failed', () => {
    const result = simulate({
      profile,
      drug: fixtureDrug,
      doses: [{ drugId: fixtureDrug.id, doseMg: 6000, timeH: 0 }],
      tEndH: 24,
      dtH: 0.05,
    });
    for (const failure of result.toxicity!.failedOrgans) {
      expect(result.toxicity!.organLoad[failure.organ]).toBeGreaterThanOrEqual(FAILURE_THRESHOLD);
    }
  });

  it('an empty dose schedule never kills the model', () => {
    const result = simulate({ profile, drug: fixtureDrug, doses: [], tEndH: 24, dtH: 0.05 });
    expect(result.toxicity!.death).toBeNull();
    expect(result.toxicity!.failedOrgans).toHaveLength(0);
  });
});
