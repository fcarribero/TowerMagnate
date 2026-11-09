import { type Fire, type Level, type TowerState } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { occupantAt, setStructure } from '../grid';
import { addPeopleForUnit, listPeople } from '../people';
import { step, type StepContext } from '../step';
import { buildTower, plainTowerPlan } from '../testing';
import { searchSteps, startBombSearch } from './bomb-search';
import { endDisaster, openBombThreat, openFire } from './decisions';
import { burnCell, noDamage } from './fire-cells';
import { pickFireTargets } from './fire-guards';

const OFFICE_LEVEL = 2;
const TOP = 12;

interface Tower {
  state: TowerState;
  officeId: string;
}

/** 64 columns on levels 1 to 12, an office on every level above the security office. */
function towerWithSecurity(
  options: { elevator: boolean; securityLevel?: Level } = { elevator: true },
) {
  const securityLevel = options.securityLevel ?? OFFICE_LEVEL;
  const units = [{ type: 'security' as const, level: securityLevel, x: 0 }];
  for (let level = 3; level <= TOP; level++) {
    if (level !== securityLevel) units.push({ type: 'office' as never, level, x: 20 });
  }
  const shafts = options.elevator
    ? [{ type: 'standard' as const, x: 40, bottom: 1, top: TOP }]
    : [];
  const { state, unitIds } = buildTower({ ...plainTowerPlan(TOP, 0, 63), units, shafts });
  const officeId = unitIds[0] as string;
  addPeopleForUnit(state, officeId);
  return { state, officeId } satisfies Tower;
}

function contextOf(state: TowerState): StepContext {
  return { state, events: [] };
}

function bombOf(state: TowerState) {
  const bomb = openBombThreat(contextOf(state), 200_000, { x: 0, level: 2 });
  if (!bomb) throw new Error('Expected a bomb threat');
  return bomb;
}

function run(state: TowerState, steps: number): TowerState {
  return step(state, [], steps).state;
}

describe('bomb search', () => {
  it('lists levels with a unit other than a lobby plus the bomb level', () => {
    const { state } = towerWithSecurity();
    const bomb = bombOf(state);
    startBombSearch(contextOf(state), bomb, 1);
    const levels = Object.keys(bomb.search?.levels ?? {}).map(Number);
    expect(levels).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('sends each guard, in id order, to the nearest free level with the higher level on a tie', () => {
    const { state } = towerWithSecurity();
    const bomb = bombOf(state);
    startBombSearch(contextOf(state), bomb, 1);
    const taken = Object.entries(bomb.search?.guards ?? {}).map(([person, guard]) => [
      Number(person),
      guard.level,
    ]);
    const ids = listPeople(state.people).map((person) => Number(person.id.slice(1)));
    expect(taken).toEqual([
      [ids[0], 2],
      [ids[1], 3],
      [ids[2], 1],
      [ids[3], 4],
      [ids[4], 5],
      [ids[5], 6],
    ]);
  });

  it('takes 96 steps for 64 columns and 240 steps for 160 columns', () => {
    const { state } = buildTower(plainTowerPlan(3, 0, 63));
    setStructure(state.grid, 3, 0, 159, 'floor');
    expect(searchSteps(state.grid, 2)).toBe(96);
    expect(searchSteps(state.grid, 3)).toBe(240);
  });

  it('starts at once on its own level and ends 96 steps later', () => {
    const { state } = towerWithSecurity();
    const bomb = bombOf(state);
    startBombSearch(contextOf(state), bomb, 12);
    const [first] = Object.values(bomb.search?.guards ?? {});
    expect(first).toEqual({ level: 2, endStep: state.step + 96 });
  });

  it('starts a level search when the guard arrives and ends it by the level size', () => {
    const { state } = towerWithSecurity();
    const bomb = bombOf(state);
    startBombSearch(contextOf(state), bomb, 12);
    const travelling = Object.values(bomb.search?.guards ?? {}).filter(
      (guard) => guard.endStep === null,
    );
    expect(travelling).toHaveLength(5);
    const later = run(state, 1500);
    expect(later.activeEvents).toEqual([]);
  });

  it('finds the bomb, ends the threat and sends every guard back to the office', () => {
    const { state, officeId } = towerWithSecurity();
    const bomb = bombOf(state);
    startBombSearch(contextOf(state), bomb, 4);
    const result = step(state, [], 1500);
    expect(result.state.activeEvents).toEqual([]);
    expect(result.events.filter((event) => event.type === 'news')).toContainEqual(
      expect.objectContaining({ key: 'news.bombFound' }),
    );
    const office = result.state.units[officeId];
    for (const guard of listPeople(result.state.people)) {
      expect(guard.level).toBe(office?.level);
    }
  });

  it('releases levels a guard cannot reach, marks them for it and sends it home', () => {
    const { state } = towerWithSecurity({ elevator: false });
    const bomb = bombOf(state);
    startBombSearch(contextOf(state), bomb, 12);
    const search = bomb.search;
    const ids = listPeople(state.people).map((person) => Number(person.id.slice(1)));
    expect(search?.guards).toEqual({ [ids[0] as number]: { level: 2, endStep: 96 } });
    expect(search?.unreachable[ids[1] as number]).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(search?.levels[3]).toBe('unsearched');
    expect(search?.levels[2]).toBe('taken');
  });

  it('gives guards no route through a service elevator', () => {
    const { state } = buildTower({
      ...plainTowerPlan(TOP, 0, 63),
      units: [
        { type: 'security', level: 2, x: 0 },
        { type: 'office', level: 5, x: 20 },
      ],
      shafts: [{ type: 'service', x: 40, bottom: 1, top: TOP }],
    });
    addPeopleForUnit(state, 'u1');
    const bomb = bombOf(state);
    startBombSearch(contextOf(state), bomb, 5);
    const ids = listPeople(state.people).map((person) => Number(person.id.slice(1)));
    expect(bomb.search?.unreachable[ids[1] as number]).toEqual([5]);
  });
});

function burningTower(guardsOnLevel: Level): { state: TowerState; fire: Fire } {
  const { state } = towerWithSecurity();
  const fire = openFire(contextOf(state), guardsOnLevel);
  if (!fire) throw new Error('Expected a fire');
  return { state, fire };
}

function ignite(fire: Fire, level: Level, step: number, column: number): void {
  const front = { x: column, progress: 0, out: false };
  fire.levels[level] = {
    ignitionStep: step,
    ignitionColumn: column,
    left: { ...front },
    right: { ...front },
  };
}

function placeGuardsAt(state: TowerState, level: Level, column: number): void {
  const pool = state.people;
  for (let slot = 0; slot < pool.id.length; slot++) {
    pool.level[slot] = level;
    pool.column[slot] = column;
  }
}

describe('fire guards', () => {
  it('sends every guard to the burning level with the fewest guards, the higher level on a tie', () => {
    const { state, fire } = burningTower(5);
    ignite(fire, 4, state.step, 30);
    ignite(fire, 7, state.step, 31);
    pickFireTargets(contextOf(state), fire);
    const levels = Object.values(fire.guards).map((guard) => guard.level);
    expect(levels).toEqual([7, 4, 7, 4, 7, 4]);
  });

  it('puts a front out 4 minutes after 3 guards arrive on it', () => {
    const { state, fire } = burningTower(5);
    ignite(fire, 5, 0, 30);
    placeGuardsAt(state, 5, 30);
    pickFireTargets(contextOf(state), fire);
    const afterArrival = run(state, 1);
    const sides = Object.values((afterArrival.activeEvents[0] as Fire).guards).map((g) => g.side);
    expect(sides).toEqual(['left', 'right', 'left', 'right', 'left', 'right']);
    const beforeLastTick = run(afterArrival, 17);
    const burning = (beforeLastTick.activeEvents[0] as Fire).levels[5];
    expect(burning?.left).toMatchObject({ progress: 9, out: false, x: 27 });
    expect(burning?.right).toMatchObject({ progress: 9, out: false, x: 33 });
    const outAt = run(beforeLastTick, 6);
    expect(outAt.activeEvents).toEqual([]);
    expect(occupantAt(outAt.grid, 5, 27)?.kind).toBe('ruins');
    expect(occupantAt(outAt.grid, 5, 33)?.kind).toBe('ruins');
    expect(occupantAt(outAt.grid, 5, 34)).toBeNull();
  });

  it('sends guards to another burning level when theirs goes out', () => {
    const { state, fire } = burningTower(5);
    ignite(fire, 5, 0, 30);
    ignite(fire, 7, 0, 30);
    burnCell(state, 5, 30, noDamage());
    burnCell(state, 7, 30, noDamage());
    placeGuardsAt(state, 5, 29);
    for (const person of listPeople(state.people)) {
      fire.guards[Number(person.id.slice(1))] = { level: 5, side: null, arrivedStep: null };
    }
    const result = run(state, 24);
    const live = result.activeEvents[0] as Fire;
    expect(Object.values(live.guards).map((guard) => guard.level)).toEqual([7, 7, 7, 7, 7, 7]);
  });

  it('counts guards from the first tick after their arrival step', () => {
    const { state, fire } = burningTower(5);
    ignite(fire, 5, 0, 30);
    state.step = 5;
    placeGuardsAt(state, 5, 30);
    pickFireTargets(contextOf(state), fire);
    const atFirstTick = run(state, 1);
    const front = (atFirstTick.activeEvents[0] as Fire).levels[5]?.left;
    expect(front).toMatchObject({ progress: 0, x: 29 });
    const atSecondTick = run(atFirstTick, 6);
    expect((atSecondTick.activeEvents[0] as Fire).levels[5]?.left.progress).toBe(3);
  });

  it('sends the guards back to the office when the fire ends', () => {
    const { state, fire } = burningTower(5);
    ignite(fire, 5, 0, 30);
    placeGuardsAt(state, 5, 30);
    endDisaster(contextOf(state), fire.id);
    const home = run(state, 1500);
    expect(listPeople(home.people).map((guard) => guard.level)).toEqual([2, 2, 2, 2, 2, 2]);
  });
});
