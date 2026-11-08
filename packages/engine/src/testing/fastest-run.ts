/**
 * Wall-clock milliseconds of the fastest of `runs` calls. A busy runner only makes a run slower,
 * so the fastest one is the closest to what the code costs.
 */
export function fastestRunMillis(work: () => void, runs = 3): number {
  let fastest = Infinity;
  for (let run = 0; run < runs; run++) {
    const started = performance.now();
    work();
    fastest = Math.min(fastest, performance.now() - started);
  }
  return fastest;
}

export function medianRunMillis(work: () => void, runs = 3): number {
  const times: number[] = [];
  for (let run = 0; run < runs; run++) {
    const started = performance.now();
    work();
    times.push(performance.now() - started);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)] as number;
}
