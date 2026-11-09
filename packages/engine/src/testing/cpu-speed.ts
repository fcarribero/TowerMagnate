/**
 * Calibration time of the reference runner: the GitHub `ubuntu-latest` runner with an AMD EPYC
 * 7763, the slowest CPU type the pool gave us, with Node 22. See docs/tech/performance.md.
 */
export const REFERENCE_CALIBRATION_MS = 33;

const RECORDS = 400;
const ROUNDS = 15;
const PASSES_PER_ROUND = 40;

interface CalibrationRecord {
  id: string;
  level: number;
  x: number;
  lease: { tenant: string; rent: number; visits: number[] } | null;
  tags: string[];
}

/** A fixed block of plain data, about the size and shape of a tower state without its people. */
function calibrationData(): CalibrationRecord[] {
  return Array.from({ length: RECORDS }, (_, index) => ({
    id: `u${index}`,
    level: (index % 20) + 1,
    x: 100 + (index % 90),
    lease:
      index % 3 === 0
        ? null
        : { tenant: `t${index}`, rent: 1000 + index, visits: [index % 7, 3, 5] },
    tags: ['office', index % 2 === 0 ? 'even' : 'odd'],
  }));
}

/** The work of one pass: what the runner and the broadcaster do most, copying and serializing. */
function calibrationPass(data: readonly CalibrationRecord[], scratch: Float64Array): number {
  const copy = structuredClone(data);
  const text = JSON.stringify(copy);
  let sum = 0;
  for (let index = 0; index < scratch.length; index++) {
    scratch[index] = (scratch[index] as number) * 0.5 + index;
    sum += scratch[index] as number;
  }
  return text.length + (sum > 0 ? 1 : 0);
}

/**
 * Times a fixed workload that does not depend on the game code, so it measures the machine only.
 * Returns the fastest round in milliseconds, since other work on the machine only makes rounds slower.
 */
export function calibrateCpu(): number {
  const data = calibrationData();
  const scratch = new Float64Array(50_000);
  let sink = 0;
  const rounds: number[] = [];
  for (let round = 0; round <= ROUNDS; round++) {
    const startedAt = performance.now();
    for (let pass = 0; pass < PASSES_PER_ROUND; pass++) sink += calibrationPass(data, scratch);
    if (round > 0) rounds.push(performance.now() - startedAt);
  }
  if (sink < 0) console.log(sink);
  return Math.min(...rounds);
}

/** How much slower this machine is than the reference runner; above 1 means slower. */
export function slowdownFactor(
  calibrationMs: number,
  referenceMs = REFERENCE_CALIBRATION_MS,
): number {
  return calibrationMs / referenceMs;
}

export interface MachineSpeed {
  calibrationMs: number;
  slowdown: number;
}

/** The faster of two calibrations, so a burst of other work on the runner does not count. */
export function machineSpeed(before: number, after: number): MachineSpeed {
  const calibrationMs = Math.min(before, after);
  return { calibrationMs, slowdown: slowdownFactor(calibrationMs) };
}

/** A lag measured on this machine expressed as it would be on the reference runner. */
export function normalizeLag(lagMs: number, slowdown: number): number {
  return lagMs / slowdown;
}
