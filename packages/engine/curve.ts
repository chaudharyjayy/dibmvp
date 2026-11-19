/** Fixed output grid with the exact endpoint and any requested in-window times. */
export function sampleTimes(tEndH: number, dtH: number, extraTimes: readonly number[] = []): number[] {
  if (!Number.isFinite(tEndH) || tEndH <= 0 || !Number.isFinite(dtH) || dtH <= 0) {
    throw new Error('Simulation window and step size must be finite and positive.');
  }
  const steps = Math.max(1, Math.ceil(tEndH / dtH));
  if (steps + extraTimes.length > 200_000) {
    throw new Error('Too many output samples. Increase the step size or shorten the window.');
  }

  const times = [0];
  for (let i = 1; i < steps; i++) {
    // Keep decimal dose times aligned with nominally equal grid samples.
    const time = Number((i * dtH).toPrecision(15));
    if (time >= tEndH) break;
    times.push(time);
  }
  times.push(tEndH);
  if (extraTimes.length === 0) return times;
  const inWindow = extraTimes.filter((time) => Number.isFinite(time) && time >= 0 && time <= tEndH);
  return [...new Set([...times, ...inWindow])].sort((a, b) => a - b);
}

/** Sampled peak and the start of the final below-threshold stretch. */
export function curveMetrics(tH: number[], concMgPerL: number[], lastDoseH = -Infinity) {
  let peakIndex = 0;
  for (let i = 1; i < concMgPerL.length; i++) {
    if (concMgPerL[i] > concMgPerL[peakIndex]) peakIndex = i;
  }

  const cmaxMgPerL = concMgPerL[peakIndex];
  const tmaxH = tH[peakIndex];
  const threshold = cmaxMgPerL * 0.05;
  let timeToClearH: number | null = null;
  for (let i = tH.length - 1; i > peakIndex && tH[i] > lastDoseH; i--) {
    if (concMgPerL[i] >= threshold) break;
    timeToClearH = tH[i];
  }
  return { cmaxMgPerL, tmaxH, timeToClearH };
}
