/**
 * The clock the animations that do not come from the server run on: people inside units, idle
 * frames, events, clouds. It stops while the game is paused and carries on from the same moment
 * afterwards.
 */
let paused = false;
let frozenAt = 0;
let offset = 0;

/** Milliseconds on a clock that does not count the time spent paused. */
export function animationNow(): number {
  return paused ? frozenAt : performance.now() - offset;
}

export function isAnimationPaused(): boolean {
  return paused;
}

export function setAnimationPaused(next: boolean): void {
  if (next === paused) {
    return;
  }
  if (next) {
    frozenAt = animationNow();
  } else {
    offset = performance.now() - frozenAt;
  }
  paused = next;
}
