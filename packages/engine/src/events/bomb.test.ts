import type {
  BombThreat,
  CellRange,
  EngineEvent,
  Level,
  TowerState,
  Unit,
} from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { STEPS_PER_HOUR } from '../calendar';
import { STEPS_PER_DAY } from '../clock';
import { occupantAt, structureAt } from '../grid';
import { addPeopleForUnit, countPeopleOfUnit, parseUnitNumber, peopleCount } from '../people';
import { createRng } from '../rng';
import { step, type StepContext } from '../step';
import { isOnTrek } from '../trek';
import { buildTower, plainTowerPlan, type PlannedUnit } from '../testing';
import { blastColumns, blastLevels, openRandomBombThreat, ruinBlastBox } from './bomb';
import { openBombThreat, openFire } from './decisions';
import { eventsPhase } from '.';

/** Seed 95 rolls 0 on its first draw, a hit; seed 1 does not. */
const HIT_SEED = 95;
const MISS_SEED = 1;
const NINE_AM = 9 * STEPS_PER_HOUR;
const TEN_AM = 10 * STEPS_PER_HOUR;
const ONE_PM = 13 * STEPS_PER_HOUR;

function towerWith(units: PlannedUnit[], floors = 20, x0 = 100, x1 = 199): TowerState {
  const { state } = buildTower({ ...plainTowerPlan(floors, x0, x1), units });
  state.stars = 2;
  return state;
}

function officeTower(): TowerState {
  return towerWith([{ type: 'office', level: 5, x: 120 }]);
}

/** Unit ids in placing order. */
function unitIdsOf(state: TowerState): string[] {
  return Object.keys(state.units);
}

function atStep(state: TowerState, stepOfDay: number, day = 1): StepContext {
  state.step = day * STEPS_PER_DAY + stepOfDay;
  return { state, events: [] };
}

function bombOf(state: TowerState): BombThreat {
  const threat = state.activeEvents.find((event) => event.kind === 'bomb');
  if (!threat) throw new Error('Expected a bomb threat');
  return threat;
}

function newsKeys(events: readonly EngineEvent[]): string[] {
  return events.flatMap((event) => (event.type === 'news' ? [event.key] : []));
}

function rollAtNine(state: TowerState, seed: number): StepContext {
  state.rng = createRng(seed);
  const context = atStep(state, NINE_AM);
  eventsPhase(context);
  return context;
}

/** Opens a threat with the bomb at `bomb` and the clock at `stepOfDay` of day 1. */
function threatAt(state: TowerState, bomb: { x: number; level: Level }, stepOfDay = NINE_AM) {
  const context = atStep(state, stepOfDay);
  const threat = openBombThreat(context, 200_000, bomb) as BombThreat;
  return { context, threat };
}

function cellsOn(cells: readonly CellRange[], level: Level): number[] {
  return cells
    .filter((cell) => cell.level === level)
    .flatMap((cell) => Array.from({ length: cell.x1 - cell.x0 + 1 }, (_, i) => cell.x0 + i))
    .sort((a, b) => a - b);
}

function columns(x0: number, x1: number): number[] {
  return Array.from({ length: x1 - x0 + 1 }, (_, i) => x0 + i);
}

describe('bomb threat roll', () => {
  it('opens a threat at 09:00 when the seeded roll hits', () => {
    const state = officeTower();
    const context = rollAtNine(state, HIT_SEED);

    const threat = bombOf(state);
    expect(threat.bomb).toEqual({ x: expect.any(Number), level: 5 });
    expect(threat.bomb.x).toBeGreaterThanOrEqual(120);
    expect(threat.bomb.x).toBeLessThanOrEqual(128);
    expect(threat.ransom).toBe(200_000);
    expect(threat.decision.deadlineStep).toBe(state.step + 360);
    expect(context.events[0]).toMatchObject({ type: 'decisionOpened', kind: 'bomb' });
    expect(newsKeys(context.events)).toEqual(['news.bombThreat']);
  });

  it('opens nothing when the roll misses', () => {
    const state = officeTower();
    rollAtNine(state, MISS_SEED);
    expect(state.activeEvents).toEqual([]);
  });

  it('rolls only at 09:00', () => {
    const state = officeTower();
    state.rng = createRng(HIT_SEED);
    eventsPhase(atStep(state, NINE_AM + 1));
    expect(state.activeEvents).toEqual([]);
    expect(state.rng).toEqual(createRng(HIT_SEED));
  });

  it.each([
    ['below 2 stars', (state: TowerState) => void (state.stars = 1)],
    ['with a fire active', (state: TowerState) => void openFire(atStep(state, 0), 5)],
    ['with only lobbies', (state: TowerState) => void (state.units = {})],
  ])('makes no draw %s', (_name, prepare) => {
    const state = officeTower();
    prepare(state);
    const fireEvents = state.activeEvents.length;
    rollAtNine(state, HIT_SEED);
    expect(state.rng).toEqual(createRng(HIT_SEED));
    expect(state.activeEvents).toHaveLength(fireEvents);
  });

  it('never hides the bomb in a lobby or the cathedral', () => {
    const state = towerWith([{ type: 'office', level: 3, x: 150 }]);
    const office = state.units[unitIdsOf(state)[0] as string] as Unit;
    state.units.u900 = { ...office, id: 'u900', level: 7, type: 'lobby' };
    state.units.u901 = { ...office, id: 'u901', level: 8, type: 'cathedral' };
    for (let seed = 1; seed <= 30; seed++) {
      state.activeEvents = [];
      state.rng = createRng(seed);
      const threat = openRandomBombThreat(atStep(state, NINE_AM)) as BombThreat;
      expect(threat.bomb.level).toBe(3);
    }
  });

  it.each([
    [2, 200_000],
    [3, 300_000],
    [4, 1_000_000],
    [5, 1_000_000],
    [6, 1_000_000],
  ] as const)('asks a ransom at %i stars of %i', (stars, ransom) => {
    const state = officeTower();
    state.stars = stars;
    rollAtNine(state, HIT_SEED);
    expect(bombOf(state).ransom).toBe(ransom);
  });

  it('keeps the ransom when the stars change during the threat', () => {
    const state = officeTower();
    rollAtNine(state, HIT_SEED);
    const id = bombOf(state).id;
    state.stars = 4;
    const paid = step(
      state,
      [{ id: 'c1', command: { type: 'answerEvent', eventId: id, choice: 'pay' } }],
      0,
    );
    expect(paid.results[0]).toMatchObject({ ok: true, cost: 200_000 });
  });
});

describe('bomb threat answers', () => {
  function threatened(): { state: TowerState; id: string } {
    const state = officeTower();
    rollAtNine(state, HIT_SEED);
    return { state, id: bombOf(state).id };
  }

  it('ends the threat at once when the ransom is paid, even with a negative balance', () => {
    const { state, id } = threatened();
    state.money = -50_000;
    const before = state.money;

    const result = step(
      state,
      [{ id: 'c1', command: { type: 'answerEvent', eventId: id, choice: 'pay' } }],
      0,
    );

    expect(result.results[0]).toMatchObject({ ok: true, cost: 200_000 });
    expect(result.state.money).toBe(before - 200_000);
    expect(result.state.activeEvents).toEqual([]);
    expect(newsKeys(result.events)).toEqual(['news.bombPaid']);
  });

  it('refuses a security office during the threat and accepts it after the ransom', () => {
    const { state, id } = threatened();
    state.money = 10_000_000;
    const placeSecurity = {
      id: 'c2',
      command: { type: 'buildUnit', unitType: 'security', x: 150, level: 7 } as const,
    };

    const during = step(state, [placeSecurity], 0);
    expect(during.results[0]).toMatchObject({ ok: false, error: 'BOMB_EVENT_ACTIVE' });

    const pay = { id: 'c1', command: { type: 'answerEvent', eventId: id, choice: 'pay' } } as const;
    const after = step(state, [pay, placeSecurity], 0);
    expect(after.results[1]).toMatchObject({ ok: true });
  });

  it('starts the search with news.bombSearch when the player refuses', () => {
    const { state, id } = threatened();
    const refuse = {
      id: 'c1',
      command: { type: 'answerEvent', eventId: id, choice: 'refuse' },
    } as const;

    const result = step(state, [refuse], 1);

    expect(bombOf(result.state).search).not.toBeNull();
    expect(newsKeys(result.events)).toEqual(['news.bombSearch']);
  });

  it('starts the search at 10:00 when nobody answers', () => {
    const { state } = threatened();
    const result = step(state, [], TEN_AM - NINE_AM);
    expect(newsKeys(result.events)).toEqual(['news.decisionDefault', 'news.bombSearch']);
    expect(bombOf(result.state).search?.bombLevel).toBe(5);
  });
});

describe('bomb search outcome', () => {
  /** A security office on level 3 and offices on 4 to 8, 64 columns wide, with an elevator. */
  function securedTower(): { state: TowerState; securityId: string } {
    const units: PlannedUnit[] = [{ type: 'security', level: 3, x: 0 }];
    for (let level = 4; level <= 8; level++) units.push({ type: 'office', level, x: 20 });
    const shafts = [{ type: 'standard' as const, x: 40, bottom: 1, top: 8 }];
    const { state, unitIds } = buildTower({ ...plainTowerPlan(8, 0, 63), units, shafts });
    state.stars = 2;
    const securityId = unitIds[0] as string;
    addPeopleForUnit(state, securityId);
    return { state, securityId };
  }

  it('finds the bomb before 13:00, ends the threat and sends every guard back', () => {
    const { state, securityId } = securedTower();
    threatAt(state, { x: 25, level: 6 });

    const result = step(state, [], ONE_PM - NINE_AM - 1);

    expect(newsKeys(result.events)).toContain('news.bombFound');
    expect(result.events.some((event) => event.type === 'disaster')).toBe(false);
    expect(result.state.activeEvents).toEqual([]);
    expect(Object.keys(result.state.units)).toHaveLength(Object.keys(state.units).length);
    const pool = result.state.people;
    const guardHome = parseUnitNumber(securityId);
    for (let slot = 0; slot < peopleCount(pool); slot++) {
      if (pool.homeUnit[slot] !== guardHome) continue;
      expect(pool.level[slot] === 3 || isOnTrek(pool, slot)).toBe(true);
    }
  });

  it('accepts a security office again once the bomb is found', () => {
    const { state } = securedTower();
    threatAt(state, { x: 25, level: 6 });
    const found = step(state, [], ONE_PM - NINE_AM - 1).state;
    found.money = 10_000_000;

    const placed = step(
      found,
      [{ id: 'c1', command: { type: 'buildUnit', unitType: 'security', x: 40, level: 8 } }],
      0,
    );

    expect(placed.results[0]).not.toMatchObject({ error: 'BOMB_EVENT_ACTIVE' });
  });

  it('explodes at 13:00 when no guard searches', () => {
    const state = officeTower();
    const officeId = unitIdsOf(state)[0] as string;
    const before = peopleCount(state.people);
    addPeopleForUnit(state, officeId);
    threatAt(state, { x: 124, level: 5 });

    const atOne = step(state, [], ONE_PM - NINE_AM);

    const disaster = atOne.events.find((event) => event.type === 'disaster');
    expect(disaster).toMatchObject({ type: 'disaster', step: atOne.state.step, kind: 'bomb' });
    expect(atOne.events).toContainEqual(
      expect.objectContaining({ type: 'news', key: 'news.bombExploded', level: 5 }),
    );
    expect(atOne.state.units[officeId]).toBeUndefined();
    expect(peopleCount(atOne.state.people)).toBe(before);
    expect(atOne.state.activeEvents).toEqual([]);
  });

  it('does not explode a step before 13:00', () => {
    const state = officeTower();
    threatAt(state, { x: 124, level: 5 });
    const result = step(state, [], ONE_PM - NINE_AM - 1);
    expect(result.events.some((event) => event.type === 'disaster')).toBe(false);
    expect(result.state.activeEvents).toHaveLength(1);
  });
});

describe('blast box', () => {
  it('ruins exactly 40 columns on 6 levels around a bomb in an empty tower', () => {
    const state = towerWith([]);

    const cells = ruinBlastBox(state, { x: 150, level: 10 });

    for (const level of [8, 9, 10, 11, 12, 13]) {
      expect(cellsOn(cells, level)).toEqual(columns(130, 169));
      expect(occupantAt(state.grid, level, 130)).toEqual({ kind: 'ruins' });
      expect(occupantAt(state.grid, level, 129)).toBeNull();
      expect(occupantAt(state.grid, level, 170)).toBeNull();
    }
    expect(cells.flatMap((cell) => cellsOn([cell], cell.level))).toHaveLength(240);
    expect(occupantAt(state.grid, 7, 150)).toBeNull();
    expect(occupantAt(state.grid, 14, 150)).toBeNull();
  });

  it('cuts the box at columns 0 and 374', () => {
    expect(blastColumns(5)).toEqual({ x0: 0, x1: 24 });
    expect(blastColumns(370)).toEqual({ x0: 350, x1: 374 });
    expect(blastColumns(150)).toEqual({ x0: 130, x1: 169 });
  });

  it('cuts the box at levels -9 and 100 and never includes 101', () => {
    expect(blastLevels(-9)).toEqual([-9, -8, -7, -6]);
    expect(blastLevels(-8)).toEqual([-9, -8, -7, -6, -5]);
    expect(blastLevels(100)).toEqual([98, 99, 100]);
    expect(blastLevels(99)).toEqual([97, 98, 99, 100]);
  });

  it('skips level 1, so a bomb on level 2 ruins -1 and 2 to 5', () => {
    expect(blastLevels(2)).toEqual([-1, 2, 3, 4, 5]);
    expect(blastLevels(-1)).toEqual([-3, -2, -1, 2, 3]);

    const { state } = buildTower({
      ...plainTowerPlan(6, 100, 199),
      floors: [
        { from: 2, to: 6, x0: 100, x1: 199 },
        { from: -1, to: -1, x0: 100, x1: 199 },
      ],
    });
    const cells = ruinBlastBox(state, { x: 150, level: 2 });

    expect([...new Set(cells.map((cell) => cell.level))].sort((a, b) => a - b)).toEqual([
      -1, 2, 3, 4, 5,
    ]);
    expect(occupantAt(state.grid, 1, 150)).toBeNull();
    expect(structureAt(state.grid, 1, 150)).toBe('lobby');
  });

  it('destroys a unit with a cell in the box, ruins all its cells and removes its people', () => {
    const state = towerWith([
      { type: 'office', level: 13, x: 165 },
      { type: 'office', level: 14, x: 150 },
    ]);
    const [hit, spared] = unitIdsOf(state) as [string, string];
    addPeopleForUnit(state, hit);
    addPeopleForUnit(state, spared);
    const keptPeople = countPeopleOfUnit(state.people, spared);

    const cells = ruinBlastBox(state, { x: 150, level: 10 });

    expect(state.units[hit]).toBeUndefined();
    expect(state.units[spared]).toBeDefined();
    expect(keptPeople).toBeGreaterThan(0);
    expect(cellsOn(cells, 13)).toEqual(columns(130, 173));
    expect(occupantAt(state.grid, 13, 173)).toEqual({ kind: 'ruins' });
    expect(peopleCount(state.people)).toBe(keptPeople);
  });

  it('charges nothing and refunds nothing for a destroyed sold condo', () => {
    const state = towerWith([{ type: 'condo', level: 10, x: 150 }]);
    const condoId = unitIdsOf(state)[0] as string;
    const condo = state.units[condoId] as never as { sale: unknown };
    condo.sale = { price: 150_000, anchorStep: 0, nextEvaluationStep: STEPS_PER_DAY };
    const money = state.money;

    ruinBlastBox(state, { x: 150, level: 10 });

    expect(state.units[condoId]).toBeUndefined();
    expect(state.money).toBe(money);
  });

  it('leaves stairs and elevator shafts standing', () => {
    const { state } = buildTower({
      ...plainTowerPlan(20, 100, 199),
      shafts: [{ type: 'standard', x: 150, bottom: 1, top: 20 }],
    });
    const shaftId = Object.keys(state.shafts)[0] as string;

    const cells = ruinBlastBox(state, { x: 150, level: 10 });

    expect(occupantAt(state.grid, 10, 150)).toEqual({ kind: 'shaft', id: shaftId });
    expect(cellsOn(cells, 10)).not.toContain(150);
    expect(state.shafts[shaftId]).toBeDefined();
  });

  it('leaves the cathedral untouched', () => {
    const { state } = buildTower({
      ...plainTowerPlan(2, 100, 127),
      floors: [{ from: 2, to: 104, x0: 100, x1: 127 }],
      units: [{ type: 'cathedral', level: 101, x: 100 }],
    });
    const cathedral = Object.values(state.units).find((unit) => unit.type === 'cathedral');

    const cells = ruinBlastBox(state, { x: 110, level: 100 });

    expect(cathedral && state.units[cathedral.id]).toEqual(cathedral);
    expect(cells.every((cell) => cell.level <= 100)).toBe(true);
    expect(occupantAt(state.grid, 101, 110)).toEqual({ kind: 'unit', id: cathedral?.id });
  });
});
