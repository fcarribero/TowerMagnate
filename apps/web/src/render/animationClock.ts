/**
 * The clock the animations that do not come from the server run on: people inside units, idle
 * frames, events, clouds. It runs as many times faster as the game speed a developer picked, stops
 * while the game is paused and carries on from the same moment afterwards.
 */
let paused = false;
let speed = 1;
/** Real and animation time at the last pause, resume or speed change. */
let anchorRealMs = 0;
let anchorMs = 0;

/** Milliseconds on a clock that runs at the game speed and does not count the time spent paused. */
export function animationNow(): number {
  return paused ? anchorMs : anchorMs + (performance.now() - anchorRealMs) * speed;
}

export function isAnimationPaused(): boolean {
  return paused;
}

/** How many times faster than real time the game runs; 1 for everyone but developers. */
export function gameSpeed(): number {
  return speed;
}

function reanchor(): void {
  anchorMs = animationNow();
  anchorRealMs = performance.now();
}

export function setAnimationPaused(next: boolean): void {
  if (next === paused) {
    return;
  }
  reanchor();
  paused = next;
}

export function setAnimationSpeed(next: number): void {
  if (next === speed || next <= 0) {
    return;
  }
  reanchor();
  speed = next;
}
