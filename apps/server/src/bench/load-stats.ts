/** Runs of one timing result must agree within this fraction of the lowest run. */
export const RUN_AGREEMENT = 0.15;

export interface LoadRun {
  ticks: number;
  p50LagMs: number;
  p95LagMs: number;
  maxLagMs: number;
  /** Process CPU time over wall time; 100 is one core fully busy. */
  cpuPercent: number;
}

export interface LoadResult {
  runs: LoadRun[];
  p50LagMs: number;
  p95LagMs: number;
  cpuPercent: number;
  /** False when p95 lag or CPU differ by more than RUN_AGREEMENT between runs. */
  runsAgree: boolean;
}

/** Nearest-rank percentile; `fraction` is 0.5 for the median, 0.95 for p95. */
export function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil(fraction * sorted.length));
  return sorted[rank - 1] as number;
}

export function median(values: readonly number[]): number {
  return percentile(values, 0.5);
}

export function agreeWithin(values: readonly number[], tolerance = RUN_AGREEMENT): boolean {
  const lowest = Math.min(...values);
  const highest = Math.max(...values);
  return highest - lowest <= lowest * tolerance;
}

export function summarizeTicks(
  lagsMs: readonly number[],
  cpuMicros: number,
  wallMs: number,
): LoadRun {
  return {
    ticks: lagsMs.length,
    p50LagMs: percentile(lagsMs, 0.5),
    p95LagMs: percentile(lagsMs, 0.95),
    maxLagMs: lagsMs.length === 0 ? Number.NaN : Math.max(...lagsMs),
    cpuPercent: (cpuMicros / 1000 / wallMs) * 100,
  };
}

/** The median of each figure over the runs, and whether the runs agree. */
export function combineRuns(runs: readonly LoadRun[]): LoadResult {
  const p95s = runs.map((run) => run.p95LagMs);
  const cpus = runs.map((run) => run.cpuPercent);
  return {
    runs: [...runs],
    p50LagMs: median(runs.map((run) => run.p50LagMs)),
    p95LagMs: median(p95s),
    cpuPercent: median(cpus),
    runsAgree: agreeWithin(p95s) && agreeWithin(cpus),
  };
}
