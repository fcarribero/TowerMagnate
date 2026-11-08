import { createTower, STEPS_PER_DAY } from '@tower-magnate/engine';
import type { TowerState } from '@tower-magnate/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REAL_MS_PER_GAME_DAY } from './real-time';
import { TowerRunner, UnknownTowerError, type AdvanceTower } from './tower-runner';
import type { TowerStore } from './tower-store';

const SECOND = 1000;
const MINUTE = 60 * SECOND;

class MemoryStore implements TowerStore {
  readonly towers = new Map<string, TowerState>();
  readonly saves: { towerId: string; step: number }[] = [];

  async load(towerId: string): Promise<TowerState | null> {
    return this.towers.get(towerId) ?? null;
  }

  async save(towerId: string, state: TowerState): Promise<void> {
    this.towers.set(towerId, state);
    this.saves.push({ towerId, step: state.step });
  }
}

const countingAdvance: AdvanceTower = (state, steps) => ({
  state: { ...state, step: state.step + steps },
  events: [],
});

describe('tower runner', () => {
  let clock: number;
  let store: MemoryStore;
  let runner: TowerRunner;

  function passTime(ms: number, tickEveryMs = 100): void {
    const end = clock + ms;
    while (clock < end) {
      clock = Math.min(clock + tickEveryMs, end);
      runner.tick();
    }
  }

  function stepOf(towerId: string): number | undefined {
    return runner.stateOf(towerId)?.step;
  }

  beforeEach(() => {
    clock = 1_000_000;
    store = new MemoryStore();
    store.towers.set('1', createTower(1));
    store.towers.set('2', createTower(2));
    runner = new TowerRunner({ store, now: () => clock, advance: countingAdvance });
  });

  it('advances one game day in 15 real minutes', async () => {
    await runner.resume('1');

    passTime(REAL_MS_PER_GAME_DAY);

    expect(stepOf('1')).toBe(STEPS_PER_DAY);
  });

  it('hands over each event once, oldest first', async () => {
    runner = new TowerRunner({
      store,
      now: () => clock,
      advance: (state, steps) => ({
        state: { ...state, step: state.step + steps },
        events: [{ type: 'news', step: state.step + steps, key: 'news.test', unitId: null }],
      }),
    });
    await runner.resume('1');
    passTime(300);

    const first = runner.takeEvents('1');

    expect(first.length).toBeGreaterThan(0);
    expect(first.map((event) => event.step)).toEqual(
      [...first.map((event) => event.step)].sort((a, b) => a - b),
    );
    expect(runner.takeEvents('1')).toEqual([]);
  });

  it('does not drift when ticks arrive late and unevenly', async () => {
    await runner.resume('1');
    const gaps = [90, 130, 70, 250, 100, 33];

    const end = clock + REAL_MS_PER_GAME_DAY;
    for (let index = 0; clock < end; index += 1) {
      clock = Math.min(clock + (gaps[index % gaps.length] ?? 100), end);
      runner.tick();
    }

    expect(stepOf('1')).toBe(STEPS_PER_DAY);
  });

  it('only counts the connected time across a pause', async () => {
    await runner.resume('1');
    passTime(2 * MINUTE);
    await runner.pause('1');

    clock += 5 * MINUTE;
    await runner.resume('1');
    runner.tick();

    expect(stepOf('1')).toBe(1152);
  });

  it('saves the tower up to date when it pauses and forgets it', async () => {
    await runner.resume('1');
    clock += 10 * SECOND;

    await runner.pause('1');

    expect(store.saves).toEqual([{ towerId: '1', step: 96 }]);
    expect(runner.isRunning('1')).toBe(false);
    expect(runner.stateOf('1')).toBeUndefined();
  });

  it('continues from the saved step when it resumes', async () => {
    store.towers.set('1', { ...createTower(1), step: 5000 });

    await runner.resume('1');
    passTime(10 * SECOND);

    expect(stepOf('1')).toBe(5096);
  });

  it('advances several towers independently', async () => {
    await runner.resume('1');
    passTime(1 * MINUTE);
    await runner.resume('2');
    passTime(1 * MINUTE);
    await runner.pause('1');
    passTime(1 * MINUTE);

    expect(store.towers.get('1')?.step).toBe(1152);
    expect(stepOf('2')).toBe(1152);
    expect(runner.runningTowers()).toEqual(['2']);
  });

  it('ignores a resume for a tower that is already running', async () => {
    await runner.resume('1');
    passTime(10 * SECOND);

    await runner.resume('1');
    passTime(10 * SECOND);

    expect(stepOf('1')).toBe(192);
  });

  it('ignores a pause for a tower that is not running', async () => {
    await runner.pause('1');

    expect(store.saves).toEqual([]);
  });

  it('rejects a resume for a tower that does not exist', async () => {
    await expect(runner.resume('99')).rejects.toBeInstanceOf(UnknownTowerError);
    expect(runner.isRunning('99')).toBe(false);
  });

  it('applies a pause that arrives while the tower is still loading', async () => {
    const resuming = runner.resume('1');
    const pausing = runner.pause('1');

    await Promise.all([resuming, pausing]);

    expect(runner.isRunning('1')).toBe(false);
    expect(store.saves).toEqual([{ towerId: '1', step: 0 }]);
  });

  it('keeps the tower running when a reconnect follows a pause', async () => {
    await runner.resume('1');
    clock += 10 * SECOND;

    const pausing = runner.pause('1');
    const resuming = runner.resume('1');
    await Promise.all([pausing, resuming]);

    expect(runner.isRunning('1')).toBe(true);
    expect(stepOf('1')).toBe(96);
  });

  it('keeps ticking other towers when one fails', async () => {
    const brokenStep = 7;
    store.towers.set('1', { ...createTower(1), step: brokenStep });
    const failures: string[] = [];
    runner = new TowerRunner({
      store,
      now: () => clock,
      advance: (state, steps) => {
        if (state.step === brokenStep) {
          throw new Error('broken tower');
        }
        return countingAdvance(state, steps);
      },
      onTickError: (towerId) => failures.push(towerId),
    });
    await runner.resume('1');
    await runner.resume('2');

    passTime(1 * SECOND, 1 * SECOND);

    expect(failures).toEqual(['1']);
    expect(stepOf('1')).toBe(brokenStep);
    expect(stepOf('2')).toBe(9);
  });

  it('saves a running tower up to date and keeps it running', async () => {
    await runner.resume('1');
    clock += 10 * SECOND;

    await runner.save('1');

    expect(store.saves).toEqual([{ towerId: '1', step: 96 }]);
    expect(runner.isRunning('1')).toBe(true);
  });

  it('saves every running tower and reports a failed save without stopping the others', async () => {
    const failures: string[] = [];
    const failingStore: TowerStore = {
      load: (towerId) => store.load(towerId),
      save: (towerId, state) =>
        towerId === '1' ? Promise.reject(new Error('disk full')) : store.save(towerId, state),
    };
    runner = new TowerRunner({
      store: failingStore,
      now: () => clock,
      advance: countingAdvance,
      onSaveError: (towerId) => failures.push(towerId),
    });
    await runner.resume('1');
    await runner.resume('2');
    clock += 10 * SECOND;

    await runner.saveAll();

    expect(failures).toEqual(['1']);
    expect(store.saves).toEqual([{ towerId: '2', step: 96 }]);
  });

  it('saves and pauses every tower on shutdown', async () => {
    await runner.resume('1');
    await runner.resume('2');
    clock += 10 * SECOND;

    await runner.shutdown();

    const savesByTower = [...store.saves].sort((a, b) => a.towerId.localeCompare(b.towerId));
    expect(savesByTower).toEqual([
      { towerId: '1', step: 96 },
      { towerId: '2', step: 96 },
    ]);
    expect(runner.runningTowers()).toEqual([]);
  });

  it('does not start a tower that was still loading when shutdown began', async () => {
    const resuming = runner.resume('1');

    await runner.shutdown();
    await resuming;

    expect(runner.isRunning('1')).toBe(false);
  });

  it('refuses to resume towers after shutdown', async () => {
    await runner.shutdown();

    await runner.resume('1');

    expect(runner.isRunning('1')).toBe(false);
  });

  it('runs the real engine by default', async () => {
    runner = new TowerRunner({ store, now: () => clock });
    await runner.resume('1');

    passTime(10 * SECOND);

    expect(stepOf('1')).toBe(96);
  });
});

describe('tower runner timer', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('ticks on an interval until stopped', async () => {
    vi.useFakeTimers({ now: 0 });
    const store = new MemoryStore();
    store.towers.set('1', createTower(1));
    const runner = new TowerRunner({ store, advance: countingAdvance });
    await runner.resume('1');

    const stop = runner.start(100);
    vi.advanceTimersByTime(10 * SECOND);
    stop();
    vi.advanceTimersByTime(10 * SECOND);

    expect(runner.stateOf('1')?.step).toBe(96);
  });
});

describe('tower runner autosave', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('saves running towers every 30 seconds until stopped', async () => {
    vi.useFakeTimers({ now: 0 });
    const store = new MemoryStore();
    store.towers.set('1', createTower(1));
    const runner = new TowerRunner({ store, advance: countingAdvance });
    await runner.resume('1');

    const stop = runner.startAutosave();
    await vi.advanceTimersByTimeAsync(29 * SECOND);
    expect(store.saves).toEqual([]);

    await vi.advanceTimersByTimeAsync(1 * SECOND);
    expect(store.saves).toEqual([{ towerId: '1', step: 288 }]);

    await vi.advanceTimersByTimeAsync(30 * SECOND);
    expect(store.saves.map((save) => save.step)).toEqual([288, 576]);

    stop();
    await vi.advanceTimersByTimeAsync(60 * SECOND);
    expect(store.saves).toHaveLength(2);
  });

  it('saves nothing while no tower runs', async () => {
    vi.useFakeTimers({ now: 0 });
    const store = new MemoryStore();
    const runner = new TowerRunner({ store, advance: countingAdvance });

    const stop = runner.startAutosave();
    await vi.advanceTimersByTimeAsync(90 * SECOND);
    stop();

    expect(store.saves).toEqual([]);
  });
});
