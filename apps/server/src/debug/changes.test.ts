import { createTower, hashState, step, STEPS_PER_DAY } from '@tower-magnate/engine';
import { buildTower, plainTowerPlan } from '@tower-magnate/engine/testing';
import type { StarRating, TowerState } from '@tower-magnate/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { TowerRunner } from '../runner';
import type { TowerStore } from '../runner';
import { DebugRefusal, fastForward, forceEvent, loadScenario, setClock, setMoney } from './changes';

class MemoryStore implements TowerStore {
  readonly towers = new Map<string, TowerState>();
  async load(towerId: string): Promise<TowerState | null> {
    return this.towers.get(towerId) ?? null;
  }
  async save(towerId: string, state: TowerState): Promise<void> {
    this.towers.set(towerId, state);
  }
}

describe('debug changes on a running tower', () => {
  let clock: number;
  let store: MemoryStore;
  let runner: TowerRunner;

  async function start(stars: StarRating = 2, tower = createTower(1)): Promise<void> {
    store.towers.set('1', { ...tower, stars });
    await runner.resume('1');
  }

  /** One office on level 2, somewhere to hide a bomb. */
  function towerWithOffice(): TowerState {
    return buildTower({ ...plainTowerPlan(2, 0, 20), units: [{ type: 'office', level: 2, x: 0 }] })
      .state;
  }

  const state = (): TowerState => runner.stateOf('1') as TowerState;

  beforeEach(() => {
    clock = 1_000_000;
    store = new MemoryStore();
    runner = new TowerRunner({ store, now: () => clock });
  });

  it.each([
    [2, 200_000],
    [3, 300_000],
    [4, 1_000_000],
    [5, 1_000_000],
    [6, 1_000_000],
  ] as const)('opens a bomb threat at %i stars with a ransom of %i', async (stars, ransom) => {
    await start(stars as StarRating, towerWithOffice());

    await runner.change('1', forceEvent('bomb'));

    expect(state().activeEvents).toEqual([
      expect.objectContaining({
        kind: 'bomb',
        ransom,
        decision: expect.objectContaining({ choice: null }),
      }),
    ]);
    expect(runner.takeEvents('1')).toEqual([
      expect.objectContaining({ type: 'decisionOpened', kind: 'bomb', step: state().step }),
      expect.objectContaining({ type: 'news', key: 'news.bombThreat' }),
    ]);
  });

  it('opens a fire', async () => {
    await start();

    await runner.change('1', forceEvent('fire'));

    expect(state().activeEvents).toEqual([expect.objectContaining({ kind: 'fire' })]);
  });

  it('refuses a bomb threat when no unit can hide the bomb', async () => {
    await start();

    await expect(runner.change('1', forceEvent('bomb'))).rejects.toEqual(
      new DebugRefusal('UNKNOWN_ENTITY'),
    );
    expect(state().activeEvents).toEqual([]);
  });

  it('refuses a second disaster and events the engine does not have yet', async () => {
    await start(2, towerWithOffice());
    await runner.change('1', forceEvent('bomb'));

    await expect(runner.change('1', forceEvent('fire'))).rejects.toEqual(
      new DebugRefusal('BOMB_EVENT_ACTIVE'),
    );
    await expect(runner.change('1', forceEvent('vip'))).rejects.toEqual(
      new DebugRefusal('INVALID_COMMAND'),
    );
    expect(state().activeEvents).toHaveLength(1);
  });

  it('announces santa at the current step and leaves the tower as it was', async () => {
    await start(2, towerWithOffice());
    const before = hashState(state());

    await runner.change('1', forceEvent('santa'));

    expect(runner.takeEvents('1')).toEqual([
      { type: 'news', step: state().step, key: 'news.santa', unitId: null },
    ]);
    expect(hashState(state())).toBe(before);
  });

  it('fast forwards a day to the same state as running the steps', async () => {
    await start();
    const expected = step(state(), [], STEPS_PER_DAY).state;

    await runner.change('1', fastForward(STEPS_PER_DAY));

    expect(hashState(state())).toBe(hashState(expected));
  });

  it('keeps the new step instead of making up for the jump', async () => {
    await start();
    await runner.change('1', fastForward(1_000));
    const jumped = state().step;

    clock += 1_000;
    runner.tick();

    expect(state().step).toBeGreaterThanOrEqual(jumped);
    expect(state().step - jumped).toBeLessThan(20);
  });

  it('saves the changed tower', async () => {
    await start();

    await runner.change('1', setMoney(1234));

    expect(store.towers.get('1')?.money).toBe(1234);
  });

  it('loads the vertical slice tower in place of the running one', async () => {
    await start();

    await runner.change('1', loadScenario('verticalSlice'));

    const loaded = store.towers.get('1') as TowerState;
    const offices = Object.values(loaded.units).filter((unit) => unit.type === 'office');
    expect(offices).toHaveLength(90);
    expect(Object.keys(loaded.transports)).toHaveLength(9);
    expect(loaded.step).toBe(0);
    expect(state()).toBe(loaded);
  });

  it('sets the clock to the next matching time, never backwards', async () => {
    await start();

    await runner.change('1', setClock(2, '08:59'));
    expect(state().step).toBe(2 * STEPS_PER_DAY + 8 * 360 + 59 * 6);

    await runner.change('1', setClock(2, '08:00'));
    expect(state().step).toBe(9 * STEPS_PER_DAY + 8 * 360);
  });
});
