import {
  chargeMoney,
  createTower,
  creditMoney,
  dateOfStep,
  hashState,
  isOnTrek,
  NOTHING_DUE,
  step,
  STEPS_PER_DAY,
  STEPS_PER_WEEK,
} from '@tower-magnate/engine';
import { buildTower, plainTowerPlan } from '@tower-magnate/engine/testing';
import {
  WEDDING_GUESTS,
  type StarRating,
  type TowerState,
  type Unit,
  type UnitId,
} from '@tower-magnate/shared';
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

  it('opens a fire in an office and lights its level', async () => {
    const tower = buildTower({
      ...plainTowerPlan(2, 0, 40),
      units: [{ type: 'office', level: 2, x: 0 }],
    }).state;
    await start(3, tower);

    await runner.change('1', forceEvent('fire'));

    expect(state().activeEvents).toEqual([expect.objectContaining({ kind: 'fire', level: 2 })]);
    expect(runner.takeEvents('1')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'news', key: 'news.fire', params: { level: 2 } }),
      ]),
    );
  });

  it('refuses a fire when no unit can burn', async () => {
    await start(3);

    await expect(runner.change('1', forceEvent('fire'))).rejects.toEqual(
      new DebugRefusal('UNKNOWN_ENTITY'),
    );
  });

  it('refuses a bomb threat when no unit can hide the bomb', async () => {
    await start();

    await expect(runner.change('1', forceEvent('bomb'))).rejects.toEqual(
      new DebugRefusal('UNKNOWN_ENTITY'),
    );
    expect(state().activeEvents).toEqual([]);
  });

  it('refuses a second disaster', async () => {
    await start(2, towerWithOffice());
    await runner.change('1', forceEvent('bomb'));

    await expect(runner.change('1', forceEvent('fire'))).rejects.toEqual(
      new DebugRefusal('BOMB_EVENT_ACTIVE'),
    );
    expect(state().activeEvents).toHaveLength(1);
  });

  /** A cathedral on level 101, as in the wedding tests; the guests need no route here. */
  function towerWithCathedral(): TowerState {
    return buildTower({
      lobby: { x0: 40, x1: 339 },
      floors: [
        { from: 2, to: 100, x0: 40, x1: 339 },
        { from: 101, to: 104, x0: 140, x1: 200 },
      ],
      units: [{ type: 'cathedral', level: 101, x: 170 }],
    }).state;
  }

  it('starts a wedding on the built cathedral without the weekend roll', async () => {
    await start(2, towerWithCathedral());
    const cathedral = Object.values(state().units).find((unit) => unit.type === 'cathedral');

    await runner.change('1', forceEvent('wedding'));

    expect(state().wedding).toMatchObject({
      day: 0,
      cathedral: cathedral?.id,
      inside: 0,
      outcome: 'pending',
    });
    expect(state().wedding?.arrivals).toHaveLength(WEDDING_GUESTS);
    expect(state().lastWeddingDay).toBe(0);
  });

  it('refuses a wedding with no cathedral', async () => {
    await start(2, towerWithOffice());
    await expect(runner.change('1', forceEvent('wedding'))).rejects.toEqual(
      new DebugRefusal('UNKNOWN_ENTITY'),
    );
    expect(state().wedding).toBeNull();
  });

  it('refuses a wedding while one is running', async () => {
    await start(2, towerWithCathedral());
    await runner.change('1', forceEvent('wedding'));
    await expect(runner.change('1', forceEvent('wedding'))).rejects.toEqual(
      new DebugRefusal('LIMIT_REACHED'),
    );
  });

  /** Two hotel rooms and an office on level 2, the first room dirty. */
  function towerWithRooms(): { tower: TowerState; dirty: string; clean: string; office: string } {
    const built = buildTower({
      ...plainTowerPlan(2, 0, 40),
      units: [
        { type: 'single-room', level: 2, x: 0 },
        { type: 'single-room', level: 2, x: 4 },
        { type: 'office', level: 2, x: 20 },
      ],
    });
    const [dirty, clean, office] = built.unitIds as [string, string, string];
    const room = built.state.units[dirty as UnitId] as Unit;
    (room.hotel as NonNullable<Unit['hotel']>).state = 'dirty';
    return { tower: built.state, dirty, clean, office };
  }

  it('infests the given dirty room and announces the level', async () => {
    const { tower, dirty, clean } = towerWithRooms();
    await start(2, tower);

    await runner.change('1', forceEvent('infestation', dirty));

    expect(state().units[dirty as UnitId]?.hotel?.state).toBe('infested');
    expect(state().units[clean as UnitId]?.hotel?.state).toBe('clean');
    expect(runner.takeEvents('1')).toEqual([
      expect.objectContaining({ type: 'roomStateChanged', unitId: dirty, state: 'infested' }),
      expect.objectContaining({ type: 'news', key: 'news.cockroaches' }),
    ]);
  });

  it('refuses an infestation without a unit, with a missing unit, or on a room that is not dirty', async () => {
    const { tower, clean, office } = towerWithRooms();
    await start(2, tower);

    await expect(runner.change('1', forceEvent('infestation'))).rejects.toEqual(
      new DebugRefusal('UNKNOWN_ENTITY'),
    );
    await expect(runner.change('1', forceEvent('infestation', 'u999'))).rejects.toEqual(
      new DebugRefusal('UNKNOWN_ENTITY'),
    );
    await expect(runner.change('1', forceEvent('infestation', clean))).rejects.toEqual(
      new DebugRefusal('INVALID_COMMAND'),
    );
    await expect(runner.change('1', forceEvent('infestation', office))).rejects.toEqual(
      new DebugRefusal('INVALID_COMMAND'),
    );
  });

  it('opens a VIP visit that books at the next 12:00, one at a time', async () => {
    await start(3);

    await runner.change('1', forceEvent('vip'));

    expect(state().vipVisit).toMatchObject({ day: 0, unitId: null, outcome: 'pending' });
    await expect(runner.change('1', forceEvent('vip'))).rejects.toEqual(
      new DebugRefusal('LIMIT_REACHED'),
    );
  });

  it('announces santa at the current step and keeps it with the notices', async () => {
    await start(2, towerWithOffice());
    const before = state();

    await runner.change('1', forceEvent('santa'));

    expect(runner.takeEvents('1')).toEqual([
      { type: 'news', step: state().step, key: 'news.santa', unitId: null, params: {} },
    ]);
    expect(state().notices).toEqual([
      ...before.notices,
      { id: `n${state().step}.0`, step: state().step, key: 'news.santa', unitId: null, params: {} },
    ]);
  });

  it('changes nothing but the notices when santa is forced', async () => {
    await start(2, towerWithOffice());
    const before = state();

    await runner.change('1', forceEvent('santa'));

    expect(hashState({ ...state(), notices: before.notices, newsSent: before.newsSent })).toBe(
      hashState(before),
    );
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

    await runner.change('1', setClock({ day: 2, time: '08:59' }));
    expect(state().step).toBe(2 * STEPS_PER_DAY + 8 * 360 + 59 * 6);

    await runner.change('1', setClock({ day: 2, time: '08:00' }));
    expect(state().step).toBe(9 * STEPS_PER_DAY + 8 * 360);
  });

  it('wakes the people who were due inside the jump, so nobody stands still after it', async () => {
    await start();
    await runner.change('1', loadScenario('verticalSlice'));
    await runner.change('1', fastForward(STEPS_PER_DAY + 60));

    await runner.change('1', setClock({ day: 2, time: '10:00' }));

    const { dueStep } = state().people;
    const overdue = dueStep.filter((due) => due !== NOTHING_DUE && due <= state().step);
    expect(overdue).toEqual([]);
    await runner.change('1', fastForward(60));
    const { people } = state();
    const onTrek = people.id.filter((_, slot) => isOnTrek(people, slot));
    expect(onTrek.length).toBeGreaterThan(0);
  });

  it('closes the week the clock jump leaves when it crosses Monday', async () => {
    const sunday = createTower(1);
    sunday.step = 6 * STEPS_PER_DAY + 14 * 360;
    creditMoney(sunday, 'condoSales', 2_250_000);
    chargeMoney(sunday, 'construction', 18_230_000);
    await start(2, sunday);

    await runner.change('1', setClock({ day: 0, time: '10:00' }));

    expect(state().step).toBe(STEPS_PER_WEEK + 10 * 360);
    expect(state().ledger.previousWeek.condoSales.income).toBe(2_250_000);
    expect(state().ledger.previousWeek.construction.expense).toBe(-18_230_000);
    expect(state().ledger.currentWeek.condoSales.income).toBe(0);
    expect(state().ledger.currentWeek.construction.expense).toBe(0);
  });

  it('closes the week when the jump lands exactly on Monday midnight', async () => {
    const sunday = createTower(1);
    sunday.step = 6 * STEPS_PER_DAY + 23 * 360;
    creditMoney(sunday, 'condoSales', 100_000);
    await start(2, sunday);

    await runner.change('1', setClock({ day: 0, time: '00:00' }));

    expect(state().step).toBe(STEPS_PER_WEEK);
    expect(state().ledger.previousWeek.condoSales.income).toBe(100_000);
    expect(state().ledger.currentWeek.condoSales.income).toBe(0);
  });

  it('sets the clock to a calendar date and time', async () => {
    await start();

    await runner.change('1', setClock({ year: 1, month: 12, day: 24, time: '10:00' }));

    expect(dateOfStep(state().step)).toMatchObject({
      year: 1,
      month: 12,
      day: 24,
      hour: 10,
      minute: 0,
    });
  });

  it('applies the Mondays a calendar jump crosses', async () => {
    const tower = createTower(1);
    creditMoney(tower, 'condoSales', 100_000);
    await start(2, tower);

    await runner.change('1', setClock({ year: 1, month: 1, day: 10, time: '09:30' }));

    expect(state().ledger.previousWeek.condoSales.income).toBe(100_000);
    expect(state().ledger.currentWeek.condoSales.income).toBe(0);
  });

  it('refuses a calendar date in the past, too far ahead, or that does not exist', async () => {
    await start();
    await runner.change('1', setClock({ year: 1, month: 3, day: 1, time: '09:00' }));
    const step = state().step;

    const refused = (clock: Parameters<typeof setClock>[0]) =>
      expect(runner.change('1', setClock(clock))).rejects.toEqual(
        new DebugRefusal('INVALID_COMMAND'),
      );
    await refused({ year: 1, month: 2, day: 1, time: '09:00' });
    await refused({ year: 1, month: 3, day: 1, time: '09:00' });
    await refused({ year: 2, month: 5, day: 1, time: '09:00' });
    await refused({ year: 1, month: 2, day: 30, time: '09:00' });
    expect(state().step).toBe(step);

    await runner.change('1', setClock({ year: 2, month: 3, day: 31, time: '09:00' }));
    expect(dateOfStep(state().step).year).toBe(2);
  });

  it('keeps the current week when the jump stays inside it', async () => {
    const tower = createTower(1);
    creditMoney(tower, 'condoSales', 100_000);
    await start(2, tower);

    await runner.change('1', setClock({ day: 3, time: '12:00' }));

    expect(state().ledger.currentWeek.condoSales.income).toBe(100_000);
    expect(state().ledger.previousWeek.condoSales.income).toBe(0);
  });
});
