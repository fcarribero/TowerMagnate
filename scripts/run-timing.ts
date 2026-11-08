const RUN_AGREEMENT = 0.15;
const MAX_ATTEMPTS = 10;

export function timeRuns(action: () => void): number[] {
  return [0, 0, 0].map(() => {
    const start = performance.now();
    action();
    return performance.now() - start;
  });
}

/** Median of three runs, or null when the runs differ by more than 15% in every attempt. */
export function medianIfRunsAgree(durations: readonly number[]): number | null {
  const sorted = [...durations].sort((a, b) => a - b);
  const [fastest, median, slowest] = sorted;
  if (fastest === undefined || median === undefined || slowest === undefined) return null;
  return slowest - fastest <= fastest * RUN_AGREEMENT ? median : null;
}

export function timeUntilRunsAgree(action: () => void): number | null {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const median = medianIfRunsAgree(timeRuns(action));
    if (median !== null) return median;
  }
  return null;
}
