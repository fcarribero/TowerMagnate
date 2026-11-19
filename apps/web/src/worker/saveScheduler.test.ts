import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SaveScheduler } from './saveScheduler';
import type { UploadOutcome } from './stateUploader';

function setup(outcomes: UploadOutcome[] = []) {
  const queue = [...outcomes];
  const save = vi.fn(async (): Promise<UploadOutcome> => queue.shift() ?? 'saved');
  const onFailingChange = vi.fn();
  const onStale = vi.fn();
  const s = new SaveScheduler({ save, onFailingChange, onStale, now: () => Date.now() });
  return { s, save, onFailingChange, onStale, queue };
}

describe('SaveScheduler', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('autosaves every 30 s', async () => {
    const { s, save } = setup();
    s.start();
    await vi.advanceTimersByTimeAsync(29_999);
    expect(save).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(save).toHaveBeenCalledTimes(2);
    s.stop();
  });

  it('changed saves once 5 s after the last change', async () => {
    const { s, save } = setup();
    s.start();
    s.changed();
    await vi.advanceTimersByTimeAsync(1000);
    s.changed();
    await vi.advanceTimersByTimeAsync(1000);
    s.changed();
    await vi.advanceTimersByTimeAsync(4999);
    expect(save).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(4000);
    expect(save).toHaveBeenCalledTimes(1);
    s.stop();
  });

  it('saveNow during a save runs one more save after it', async () => {
    let release!: (o: UploadOutcome) => void;
    const save = vi
      .fn<() => Promise<UploadOutcome>>()
      .mockImplementationOnce(() => new Promise((r) => (release = r)))
      .mockResolvedValue('saved');
    const s = new SaveScheduler({ save, onFailingChange: vi.fn(), onStale: vi.fn() });
    s.start();
    s.saveNow();
    expect(save).toHaveBeenCalledTimes(1);
    s.saveNow();
    s.saveNow();
    expect(save).toHaveBeenCalledTimes(1);
    release('saved');
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(2);
    s.stop();
  });

  it('retries at 5, 15, 30 then every 60 s', async () => {
    const { s, save } = setup(['failed', 'failed', 'failed', 'failed', 'failed']);
    s.start();
    s.saveNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(1);
    for (const [delay, count] of [
      [5_000, 2],
      [15_000, 3],
      [30_000, 4],
      [60_000, 5],
      [60_000, 6],
    ] as const) {
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(save).toHaveBeenCalledTimes(count - 1);
      await vi.advanceTimersByTimeAsync(1);
      expect(save).toHaveBeenCalledTimes(count);
    }
    s.stop();
  });

  it('reports failing after two minutes without a save and clears it on success', async () => {
    const outcomes: UploadOutcome[] = Array(10).fill('failed');
    const { s, save, onFailingChange, queue } = setup(outcomes);
    s.start();
    s.saveNow();
    await vi.advanceTimersByTimeAsync(119_999);
    expect(onFailingChange).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onFailingChange).toHaveBeenCalledTimes(1);
    expect(onFailingChange).toHaveBeenLastCalledWith(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(onFailingChange).toHaveBeenCalledTimes(1);
    queue.length = 0;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(onFailingChange).toHaveBeenCalledTimes(2);
    expect(onFailingChange).toHaveBeenLastCalledWith(false);
    expect(save).toHaveBeenCalled();
    s.stop();
  });

  it('stale stops every timer and never saves again', async () => {
    const { s, save, onStale } = setup(['stale']);
    s.start();
    s.changed();
    s.saveNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(onStale).toHaveBeenCalledTimes(1);
    s.changed();
    s.saveNow();
    await vi.advanceTimersByTimeAsync(300_000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(onStale).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stop during a save leaves no timer and no later callbacks', async () => {
    let release!: (o: UploadOutcome) => void;
    const save = vi.fn(() => new Promise<UploadOutcome>((r) => (release = r)));
    const onFailingChange = vi.fn();
    const onStale = vi.fn();
    const s = new SaveScheduler({ save, onFailingChange, onStale });
    s.start();
    s.saveNow();
    s.stop();
    release('stale');
    await vi.advanceTimersByTimeAsync(300_000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(onStale).not.toHaveBeenCalled();
    expect(onFailingChange).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('changed during a save saves 5 s after the change', async () => {
    let release!: (o: UploadOutcome) => void;
    const save = vi
      .fn<() => Promise<UploadOutcome>>()
      .mockImplementationOnce(() => new Promise((r) => (release = r)))
      .mockResolvedValue('saved');
    const s = new SaveScheduler({ save, onFailingChange: vi.fn(), onStale: vi.fn() });
    s.start();
    s.saveNow();
    await vi.advanceTimersByTimeAsync(1000);
    s.changed();
    await vi.advanceTimersByTimeAsync(2000);
    release('saved');
    await vi.advanceTimersByTimeAsync(2999);
    expect(save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(2);
    s.stop();
  });

  it('survives throwing callbacks', async () => {
    const save = vi
      .fn<() => Promise<UploadOutcome>>()
      .mockResolvedValue('failed');
    const onFailingChange = vi.fn(() => {
      throw new Error('boom');
    });
    const s = new SaveScheduler({ save, onFailingChange, onStale: vi.fn() });
    s.start();
    s.saveNow();
    await vi.advanceTimersByTimeAsync(130_000);
    expect(onFailingChange).toHaveBeenCalledWith(true);
    expect(save.mock.calls.length).toBeGreaterThan(4);
    s.stop();
  });
});
