import {
  HELICOPTER_COST,
  UNIT_CATALOG,
  type EngineEvent,
  type Fire,
  type Level,
  type TowerState,
  type Unit,
} from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { STEPS_PER_HOUR, STEPS_PER_MINUTE } from '../calendar';
import { STEPS_PER_DAY } from '../clock';
import { occupantAt } from '../grid';
import { addPeopleForUnit, listPeople, slotOfPerson } from '../people';
import { createRng } from '../rng';
import { step, type StepContext } from '../step';
import { buildTower, plainTowerPlan, type PlannedUnit } from '../testing';
import { cancelTrek } from '../trek';
import { answerDecision, openFire } from './decisions';
import { noDamage } from './fire-cells';
import { fireCandidates, igniteLevel } from './fire';
import { eventsPhase } from '.';

/** Seed 95 rolls 0 on its first draw of 1 in 84, a hit; seed 1 does not. */
const HIT_SEED = 95;
const MISS_SEED = 1;
const THREE_PM = 15 * STEPS_PER_HOUR;
const WEDNESDAY = 2;
const SATURDAY = 5;
const ORIGIN_LEVEL = 40;
const ORIGIN_COLUMN = 150;

function minutes(count: number): number {
  return count * STEPS_PER_MINUTE;
}

function towerWith(units: PlannedUnit[], floors = 50, x0 = 100, x1 = 259): TowerState {
  const { state } = buildTower({ ...plainTowerPlan(floors, x0, x1), units });
  state.stars = 3;
  return state;
}

function atThreePm(state: TowerState, day = WEDNESDAY): StepContext {
  state.step = day * STEPS_PER_DAY + THREE_PM;
  return { state, events: [] };
}

function fireOf(state: TowerState): Fire | undefined {
  return state.activeEvents.find((event): event is Fire => event.kind === 'fire');
}

function newsKeys(events: readonly EngineEvent[]): string[] {
  return events.flatMap((event) => (event.type === 'news' ? [event.key] : []));
}

/** Runs the events phase alone, one step at a time, keeping every event. */
function advance(context: StepContext, steps: number): void {
  for (let at = 0; at < steps; at++) {
    context.state.step += 1;
    eventsPhase(context);
  }
}

/** A fire lit by hand at the events spec example origin: column 150 on level 40, at 15:00. */
function exampleFire(state: TowerState): { context: StepContext; fire: Fire } {
  const context = atThreePm(state);
  const fire = openFire(context, ORIGIN_LEVEL) as Fire;
  igniteLevel(context, fire, ORIGIN_LEVEL, ORIGIN_COLUMN, noDamage());
  return { context, fire };
}

function span(fire: Fire, level: Level): [number, number] | undefined {
  const burning = fire.levels[level];
  return burning ? [burning.left.x, burning.right.x] : undefined;
}

describe('fire roll at 15:00', () => {
  it('opens a fire with the decision, the alert and the origin cell burned on a hit', () => {
    const state = towerWith([{ type: 'office', level: 12, x: 120 }]);
    state.rng = createRng(HIT_SEED);
    const context = atThreePm(state);
    eventsPhase(context);

    const fire = fireOf(state) as Fire;
    expect(fire.level).toBe(12);
    expect(fire.decision).toMatchObject({
      options: ['helicopter', 'burn'],
      defaultChoice: 'burn',
      deadlineStep: state.step + STEPS_PER_HOUR,
    });
    const origin = fire.levels[12];
    const width = UNIT_CATALOG.office.width;
    expect(origin?.ignitionColumn).toBeGreaterThanOrEqual(120);
    expect(origin?.ignitionColumn).toBeLessThan(120 + width);
    expect(Object.keys(state.units)).toEqual([]);
    expect(newsKeys(context.events)).toEqual(['news.fire']);
    expect(context.events).toContainEqual(
      expect.objectContaining({ key: 'news.fire', params: { level: 12 } }),
    );
    expect(context.events).toContainEqual(
      expect.objectContaining({
        type: 'disaster',
        kind: 'fire',
        cells: [{ level: 12, x0: 120, x1: 120 + width - 1 }],
      }),
    );
  });

  it('draws and misses on another seed, and rolls only at 15:00', () => {
    const state = towerWith([{ type: 'office', level: 12, x: 120 }]);
    state.rng = createRng(MISS_SEED);
    eventsPhase(atThreePm(state));
    expect(fireOf(state)).toBeUndefined();
    expect(state.rng).not.toEqual(createRng(MISS_SEED));

    const early = towerWith([{ type: 'office', level: 12, x: 120 }]);
    early.rng = createRng(HIT_SEED);
    const context = atThreePm(early);
    early.step -= 1;
    eventsPhase(context);
    expect(early.rng).toEqual(createRng(HIT_SEED));
  });

  it.each([
    ['below 3 stars', (state: TowerState) => void (state.stars = 2)],
    ['with a disaster active', (state: TowerState) => void openFire({ state, events: [] }, 12)],
    ['with only a lobby', (state: TowerState) => void (state.units = {})],
  ])('makes no draw %s', (_name, prepare) => {
    const state = towerWith([{ type: 'office', level: 12, x: 120 }]);
    state.rng = createRng(HIT_SEED);
    const context = atThreePm(state);
    prepare(state);
    const before = state.activeEvents.length;
    eventsPhase(context);
    expect(state.rng).toEqual(createRng(HIT_SEED));
    expect(state.activeEvents).toHaveLength(before);
  });

  it('makes no draw on the day of a wedding attempt, even after its guests left', () => {
    const state = towerWith([{ type: 'office', level: 12, x: 120 }]);
    state.rng = createRng(HIT_SEED);
    state.wedding = null;
    state.lastWeddingDay = SATURDAY;
    eventsPhase(atThreePm(state, SATURDAY));
    expect(state.rng).toEqual(createRng(HIT_SEED));
    expect(fireOf(state)).toBeUndefined();
  });

  it('rolls the day after a wedding attempt', () => {
    const state = towerWith([{ type: 'office', level: 12, x: 120 }]);
    state.rng = createRng(HIT_SEED);
    state.lastWeddingDay = SATURDAY - 1;
    eventsPhase(atThreePm(state, SATURDAY));
    expect(fireOf(state)).toBeDefined();
  });

  it('still rolls on a weekend at 5 stars with a cathedral when no attempt was made', () => {
    const state = towerWith([{ type: 'office', level: 12, x: 120 }]);
    const office = Object.values(state.units)[0] as Unit;
    state.units.u900 = { ...office, id: 'u900', type: 'cathedral', level: 101 };
    state.stars = 5;
    state.rng = createRng(HIT_SEED);
    eventsPhase(atThreePm(state, SATURDAY));
    expect(fireOf(state)).toBeDefined();
  });

  it('counts only units from level 2 to 100 on a floor of 32 structure columns or more', () => {
    const wide = towerWith([
      { type: 'office', level: 12, x: 120 },
      { type: 'office', level: 3, x: 100 },
    ]);
    expect(fireCandidates(wide).map((unit) => unit.level)).toEqual([12, 3]);

    const narrow = towerWith([{ type: 'office', level: 5, x: 100 }], 10, 100, 130);
    expect(fireCandidates(narrow)).toEqual([]);
    const justWide = towerWith([{ type: 'office', level: 5, x: 100 }], 10, 100, 131);
    expect(fireCandidates(justWide)).toHaveLength(1);
  });
});

describe('fire spread', () => {
  it('moves each front one column a minute, burning empty structure to ruins', () => {
    const { context, fire } = exampleFire(towerWith([]));
    advance(context, minutes(1) - 1);
    expect(span(fire, ORIGIN_LEVEL)).toEqual([150, 150]);
    advance(context, 1);
    expect(span(fire, ORIGIN_LEVEL)).toEqual([149, 151]);
    advance(context, minutes(6));
    expect(span(fire, ORIGIN_LEVEL)).toEqual([143, 157]);
    for (let x = 143; x <= 157; x++) {
      expect(occupantAt(context.state.grid, ORIGIN_LEVEL, x)?.kind).toBe('ruins');
    }
    expect(occupantAt(context.state.grid, ORIGIN_LEVEL, 142)).toBeNull();
  });

  it('reports the cells that became ruins once per step', () => {
    const { context } = exampleFire(towerWith([]));
    advance(context, minutes(1));
    const disasters = context.events.filter((event) => event.type === 'disaster');
    expect(disasters).toEqual([
      expect.objectContaining({
        step: context.state.step,
        kind: 'fire',
        cells: [
          { level: 40, x0: 149, x1: 149 },
          { level: 40, x0: 151, x1: 151 },
        ],
      }),
    ]);
  });

  it('destroys a unit it reaches with no refund and the unit earns nothing again', () => {
    const state = towerWith([{ type: 'office', level: ORIGIN_LEVEL, x: 160 }]);
    const officeId = Object.keys(state.units)[0] as string;
    addPeopleForUnit(state, officeId);
    const money = state.money;
    const { context } = exampleFire(state);
    advance(context, minutes(10));
    expect(state.units[officeId]).toBeUndefined();
    expect(state.money).toBe(money);
    const width = UNIT_CATALOG.office.width;
    for (let x = 160; x < 160 + width; x++) {
      expect(occupantAt(state.grid, ORIGIN_LEVEL, x)?.kind).toBe('ruins');
    }
    expect(listPeople(state.people)).toEqual([]);
  });

  it('lights the level above at exactly 30 minutes, at the burned column nearest the origin', () => {
    const state = towerWith([]);
    const { context, fire } = exampleFire(state);
    advance(context, minutes(30) - 1);
    expect(fire.levels[41]).toBeUndefined();
    advance(context, 1);
    expect(fire.levels[41]).toMatchObject({ ignitionStep: state.step, ignitionColumn: 150 });
  });

  it('climbs to the burned column nearest the origin with structure above, the lower on a tie', () => {
    const state = towerWith([]);
    const { context, fire } = exampleFire(state);
    for (const x of [148, 149, 150, 151, 152]) {
      const row = state.grid.levels[41];
      if (row) row.structure = row.structure.flatMap((s) => cut(s, x));
    }
    advance(context, minutes(30));
    expect(fire.levels[41]?.ignitionColumn).toBe(147);
  });

  it('never climbs above level 100', () => {
    const state = towerWith([], 100);
    const context = atThreePm(state);
    const fire = openFire(context, 100) as Fire;
    igniteLevel(context, fire, 100, ORIGIN_COLUMN, noDamage());
    advance(context, minutes(31));
    expect(Object.keys(fire.levels)).toEqual(['100']);
  });
});

type StructureSpan = NonNullable<TowerState['grid']['levels'][number]>['structure'][number];

function cut(span: StructureSpan, x: number): StructureSpan[] {
  if (x < span.x0 || x > span.x1) return [span];
  const pieces: StructureSpan[] = [];
  if (span.x0 < x) pieces.push({ ...span, x1: x - 1 });
  if (x < span.x1) pieces.push({ ...span, x0: x + 1 });
  return pieces;
}

describe('end of the fire', () => {
  it('helicopter charges $500,000, puts every level out and keeps the ruins', () => {
    const state = towerWith([]);
    const { context, fire } = exampleFire(state);
    advance(context, minutes(10));
    const money = state.money;
    expect(answerDecision(state, fire.id, 'helicopter')).toEqual({
      ok: true,
      cost: HELICOPTER_COST,
    });
    expect(state.money).toBe(money - HELICOPTER_COST);
    context.events.length = 0;
    advance(context, 1);
    expect(fireOf(state)).toBeUndefined();
    expect(newsKeys(context.events)).toEqual(['news.fireHelicopter']);
    expect(occupantAt(state.grid, ORIGIN_LEVEL, 140)?.kind).toBe('ruins');
    expect(occupantAt(state.grid, ORIGIN_LEVEL, 139)).toBeNull();
  });

  it('a later helicopter saves less', () => {
    const ruinsAfter = (answerMinute: number): number => {
      const state = towerWith([]);
      const { context, fire } = exampleFire(state);
      advance(context, minutes(answerMinute));
      answerDecision(state, fire.id, 'helicopter');
      advance(context, 1);
      return state.grid.levels[ORIGIN_LEVEL]?.occupants.length ?? 0;
    };
    expect(ruinsAfter(10)).toBe(21);
    expect(ruinsAfter(55)).toBeGreaterThan(ruinsAfter(10));
  });

  it('events 13.4: with no security it burns levels 40 to 47 and goes out at 19:00', () => {
    const state = towerWith([]);
    const { context, fire } = exampleFire(state);
    advance(context, minutes(50));
    expect(fire.levels[40]?.left).toMatchObject({ x: 100, out: false });
    advance(context, minutes(1));
    expect(fire.levels[40]?.left).toMatchObject({ x: 100, out: true });
    advance(context, minutes(58));
    expect(fire.levels[40]?.right).toMatchObject({ x: 259, out: false });
    advance(context, minutes(1));
    expect(fire.levels[40]?.right).toMatchObject({ x: 259, out: true });

    const start = fire.startStep;
    advance(context, 4 * STEPS_PER_HOUR - (state.step - start) - 1);
    expect(Object.keys(fire.levels).map(Number)).toEqual([40, 41, 42, 43, 44, 45, 46, 47]);
    expect(fire.levels[47]?.ignitionStep).toBe(start + 7 * 30 * STEPS_PER_MINUTE);
    context.events.length = 0;
    advance(context, 1);
    expect(fireOf(state)).toBeUndefined();
    expect(fire.levels[48]).toBeUndefined();
    expect(newsKeys(context.events)).toEqual(['news.fireOut']);
  });

  it('events 13.3: six guards arriving at 15:07:30 put level 40 out at 15:11', () => {
    const { state, unitIds } = buildTower({
      ...plainTowerPlan(50, 100, 259),
      units: [{ type: 'security', level: 20, x: 100 }],
    });
    state.stars = 3;
    addPeopleForUnit(state, unitIds[0] as string);
    const { context, fire } = exampleFire(state);
    advance(context, minutes(7));
    expect(span(fire, 40)).toEqual([143, 157]);

    advance(context, STEPS_PER_MINUTE / 2);
    const pool = state.people;
    const sides = ['left', 'right'] as const;
    listPeople(pool).forEach((guard, index) => {
      const slot = slotOfPerson(pool, Number(guard.id.slice(1)));
      cancelTrek(context, slot);
      pool.level[slot] = 40;
      pool.column[slot] = 142;
      const side = sides[index % 2] as (typeof sides)[number];
      fire.guards[Number(guard.id.slice(1))] = { level: 40, side, arrivedStep: state.step };
    });

    advance(context, STEPS_PER_MINUTE / 2);
    expect(span(fire, 40)).toEqual([142, 158]);
    expect(fire.levels[40]?.left.progress).toBe(3);
    advance(context, minutes(2));
    expect(span(fire, 40)).toEqual([140, 160]);
    context.events.length = 0;
    advance(context, minutes(1));
    expect(fireOf(state)).toBeUndefined();
    expect(fire.levels[40]).toMatchObject({ left: { x: 140, out: true }, right: { x: 160 } });
    expect(newsKeys(context.events)).toEqual(['news.fireOut']);
    expect(context.events).toContainEqual(
      expect.objectContaining({ type: 'decisionClosed', choice: 'burn' }),
    );
    expect(fire.levels[41]).toBeUndefined();
  });
});

describe('fire through the whole step', () => {
  function fireDay(seed: number): TowerState {
    const state = towerWith([{ type: 'office', level: 12, x: 120 }]);
    state.rng = createRng(seed);
    state.step = WEDNESDAY * STEPS_PER_DAY + THREE_PM - 1;
    return step(state, [], minutes(20)).state;
  }

  it('the same seed gives the same fire and the same ruins', () => {
    let seed = 1;
    while (!fireDay(seed).grid.levels[12]?.occupants.some((o) => o.occupant.kind === 'ruins')) {
      seed += 1;
    }
    expect(JSON.stringify(fireDay(seed))).toBe(JSON.stringify(fireDay(seed)));
    expect(fireOf(fireDay(seed))?.levels[12]).toBeDefined();
  });
});
