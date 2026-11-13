/** How long one tile or unit takes to rise from the floor to its full height. */
export const BUILD_MS = 700;
/** Delay between neighbouring tiles of a floor run, so the run builds as a wave. */
export const BUILD_STAGGER_MS = 24;
/** The wave never takes longer than this from its first tile to its last. */
export const MAX_STAGGER_MS = 500;
/** The reveal grows in steps of this many pixels, which keeps the pixel art look. */
export const REVEAL_STEP = 2;

export const BUILD_EDGE_COLOR = 0xffd400;
export const BUILD_EDGE_HEIGHT = 2;

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

/** 0 to 1 over `BUILD_MS`, easing out so a building starts fast and settles. */
export function buildProgress(elapsedMs: number): number {
  const t = clamp01(elapsedMs / BUILD_MS);
  return 1 - (1 - t) * (1 - t);
}

/** Delay between the tiles of a run of `length` tiles. */
export function staggerFor(length: number): number {
  return length <= 1 ? 0 : Math.min(BUILD_STAGGER_MS, MAX_STAGGER_MS / (length - 1));
}

/** Time from the start of a run's reveal to the end of its last tile. */
export function runDurationMs(length: number): number {
  return BUILD_MS + staggerFor(length) * Math.max(length - 1, 0);
}

/** The visible height of a thing `height` px tall at a progress, in whole steps. */
export function revealedHeight(height: number, progress: number): number {
  if (progress >= 1) {
    return height;
  }
  return Math.min(Math.floor((height * progress) / REVEAL_STEP) * REVEAL_STEP, height);
}

/** Splits sorted column numbers into runs of consecutive columns. */
export function columnRuns(columns: readonly number[]): { from: number; to: number }[] {
  const runs: { from: number; to: number }[] = [];
  for (const column of columns) {
    const last = runs.at(-1);
    if (last !== undefined && last.to + 1 === column) {
      last.to = column;
    } else {
      runs.push({ from: column, to: column });
    }
  }
  return runs;
}
