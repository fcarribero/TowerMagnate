export interface Throttled {
  /** Runs now if the last run is old enough, otherwise once when the interval ends. */
  request(): void;
  cancel(): void;
}

export function throttle(run: () => void, intervalMs: number): Throttled {
  let lastRun = -Infinity;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const runNow = (): void => {
    timer = null;
    lastRun = Date.now();
    run();
  };

  return {
    request() {
      if (timer !== null) {
        return;
      }
      const wait = lastRun + intervalMs - Date.now();
      if (wait <= 0) {
        runNow();
      } else {
        timer = setTimeout(runNow, wait);
      }
    },
    cancel() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
