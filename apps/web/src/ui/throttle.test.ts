import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { throttle } from './throttle';

describe('throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs the first request at once and folds later ones into one run per interval', () => {
    const run = vi.fn();
    const throttled = throttle(run, 1000);
    throttled.request();
    expect(run).toHaveBeenCalledTimes(1);
    throttled.request();
    throttled.request();
    vi.advanceTimersByTime(999);
    expect(run).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('runs at once again after a quiet interval', () => {
    const run = vi.fn();
    const throttled = throttle(run, 1000);
    throttled.request();
    vi.advanceTimersByTime(1500);
    throttled.request();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('drops a pending run when cancelled', () => {
    const run = vi.fn();
    const throttled = throttle(run, 1000);
    throttled.request();
    throttled.request();
    throttled.cancel();
    vi.advanceTimersByTime(2000);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
