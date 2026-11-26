import {
  BUILDER_CREW_SIZE,
  type Command,
  type QueuedCommand,
  type TowerState,
} from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { STEPS_PER_HOUR } from './calendar';
import { STEPS_PER_DAY } from './clock';
import { computeAppraisal } from './appraisal';
import { constructionPointsFor, siteProgress } from './construction';
import { listPeople } from './people';
import { step } from './step';
import { buildTower, plainTowerPlan } from './testing';

function tower(): TowerState {
  const { state } = buildTower({
    ...plainTowerPlan(3, 0, 80),
    shafts: [{ type: 'standard', x: 40, bottom: 1, top: 3, cars: 2 }],
  });
  state.money = 99_999_999;
  state.stars = 6;
  return state;
}

function at(day: number, hour: number): number {
  return day * STEPS_PER_DAY + hour * STEPS_PER_HOUR;
}

function buildOffice(state: TowerState, x: number, level = 2): TowerState {
  const command: QueuedCommand = {
    id: 'c1',
    command: { type: 'buildUnit', unitType: 'office', x, level } as Command,
  };
  const { state: next, results } = step(state, [command], 0);
  expect(results[0]?.ok).toBe(true);
  return next;
}

function advance(state: TowerState, steps: number): TowerState {
  return step(state, [], steps).state;
}

function builders(state: TowerState) {
  return listPeople(state.people).filter((person) => person.kind === 'builder');
}

/** Day 0 is a Monday. */
function startOfDay(state: TowerState, day: number, hour: number): TowerState {
  return { ...state, step: at(day, hour) };
}

describe('construction sites', () => {
  it('puts a site on the grid and takes the money, but builds no unit yet', () => {
    const before = startOfDay(tower(), 0, 7);
    const after = buildOffice(before, 0);
    expect(Object.keys(after.sites)).toHaveLength(1);
    expect(Object.keys(after.units)).toHaveLength(0);
    expect(after.money).toBeLessThan(before.money);
    expect(Object.values(after.sites)[0]?.points).toBe(0);
  });

  it('sets the price once, at placement, to the appraisal of that moment', () => {
    const before = startOfDay(tower(), 0, 7);
    const appraisal = computeAppraisal(before, { type: 'office' });
    const after = buildOffice(before, 0);
    const site = Object.values(after.sites)[0];
    expect(site?.price).toBe(appraisal);
    const later = advance({ ...after, stars: 1 }, 10);
    expect(Object.values(later.sites)[0]?.price).toBe(appraisal);
  });

  it('keeps the site cells taken', () => {
    const state = buildOffice(startOfDay(tower(), 0, 7), 0);
    const command: QueuedCommand = {
      id: 'c2',
      command: { type: 'buildUnit', unitType: 'office', x: 4, level: 2 } as Command,
    };
    expect(step(state, [command], 0).results[0]).toMatchObject({ ok: false });
  });

  it('leaves dirt where the crew walks', () => {
    const state = buildOffice(startOfDay(tower(), 0, 7), 0);
    const later = advance(state, STEPS_PER_HOUR + 10 * 6);
    const lobby = later.heat?.dirt['1'] ?? [];
    expect(lobby.reduce((sum, dirt) => sum + dirt, 0)).toBeGreaterThan(0);
  });

  it('sends a crew of five through the entrance when the work day starts', () => {
    const state = buildOffice(startOfDay(tower(), 0, 7), 0);
    const early = advance(state, STEPS_PER_HOUR - 6);
    expect(builders(early)).toHaveLength(0);
    const started = advance(early, 12);
    expect(builders(started)).toHaveLength(BUILDER_CREW_SIZE);
    expect(builders(started).every((person) => person.level === 1)).toBe(true);
  });

  it('finishes the site, leaves a vacant unit and sends the crew home', () => {
    let state = buildOffice(startOfDay(tower(), 0, 7), 0);
    const id = Object.keys(state.sites)[0] as string;
    state = advance(state, 10 * STEPS_PER_HOUR);
    expect(state.sites[id]).toBeUndefined();
    expect(state.units[id]).toMatchObject({ type: 'office', x: 0, level: 2 });
    expect(builders(state)).toHaveLength(0);
  });

  it('adds points only while builders stand at the site', () => {
    let state = buildOffice(startOfDay(tower(), 0, 7), 0);
    const id = Object.keys(state.sites)[0] as string;
    state = advance(state, STEPS_PER_HOUR + 30);
    const early = state.sites[id]?.points ?? -1;
    expect(early).toBe(0);
    state = advance(state, STEPS_PER_HOUR / 2);
    const later = state.sites[id];
    expect(later === undefined || later.points > 0).toBe(true);
    if (later) {
      expect(siteProgress(later)).toBeLessThan(1);
      expect(later.points).toBeLessThan(constructionPointsFor(later.type));
    }
  });

  it('does not send a crew for a site placed in the last hour of work', () => {
    const state = buildOffice(startOfDay(tower(), 0, 16.25), 0);
    const evening = advance(state, 3 * STEPS_PER_HOUR);
    expect(builders(evening)).toHaveLength(0);
    expect(Object.values(evening.sites)[0]?.points).toBe(0);
    const nextMorning = advance(evening, 15 * STEPS_PER_HOUR);
    expect(builders(nextMorning).length + Object.keys(nextMorning.units).length).toBeGreaterThan(0);
  });

  it('makes the crew leave when the work day ends and come back the next work day', () => {
    let state = buildOffice(startOfDay(tower(), 0, 7), 0);
    for (const x of [10, 20, 30, 50, 60, 70]) state = buildOffice(state, x);
    state = advance(state, 9.5 * STEPS_PER_HOUR);
    expect(builders(state).length).toBeGreaterThan(0);
    // The crew also has to walk out to the map edge before it is gone.
    state = advance(state, 2.5 * STEPS_PER_HOUR);
    expect(builders(state)).toHaveLength(0);
    expect(Object.keys(state.sites).length).toBeGreaterThan(0);
    state = advance(state, 15 * STEPS_PER_HOUR);
    expect(builders(state).length).toBeGreaterThan(0);
  });

  it('works on Saturday', () => {
    const saturday = buildOffice(startOfDay(tower(), 5, 6), 0);
    const midday = advance(saturday, 4 * STEPS_PER_HOUR);
    expect(builders(midday).length).toBeGreaterThan(0);
  });

  it('does not work on Sunday', () => {
    const sunday = buildOffice(startOfDay(tower(), 6, 6), 0);
    const evening = advance(sunday, 12 * STEPS_PER_HOUR);
    expect(builders(evening)).toHaveLength(0);
    expect(Object.values(evening.sites)[0]?.points).toBe(0);
  });

  it('works the sites in the order they were placed', () => {
    let state = buildOffice(startOfDay(tower(), 0, 7), 0);
    state = buildOffice(advance(state, 12), 10);
    const [first, second] = Object.keys(state.sites);
    state = advance(state, 3.5 * STEPS_PER_HOUR);
    const firstSite = state.sites[first as string];
    const secondSite = state.sites[second as string];
    if (secondSite) {
      expect(firstSite === undefined || firstSite.points >= secondSite.points).toBe(true);
    }
  });

  it('builds a priority site before an older one', () => {
    let state = buildOffice(startOfDay(tower(), 0, 7), 0);
    state = buildOffice(advance(state, 12), 10);
    const [first, second] = Object.keys(state.sites) as [string, string];
    const marked = step(
      state,
      [
        {
          id: 'p1',
          command: { type: 'setSitePriority', unitId: second, priority: true } as Command,
        },
      ],
      0,
    );
    expect(marked.results[0]).toMatchObject({ ok: true });
    state = advance(marked.state, 1.5 * STEPS_PER_HOUR);
    const firstPoints = state.sites[first]?.points ?? Number.POSITIVE_INFINITY;
    const secondPoints = state.sites[second]?.points ?? Number.POSITIVE_INFINITY;
    expect(secondPoints).toBeGreaterThan(0);
    expect(secondPoints).toBeGreaterThan(
      firstPoints === Number.POSITIVE_INFINITY ? 0 : firstPoints,
    );
  });

  it('drops the priority flag when the site is finished', () => {
    let state = buildOffice(startOfDay(tower(), 0, 7), 0);
    const id = Object.keys(state.sites)[0] as string;
    state = step(
      state,
      [{ id: 'p1', command: { type: 'setSitePriority', unitId: id, priority: true } as Command }],
      0,
    ).state;
    expect(state.sites[id]?.priority).toBe(true);
    state = advance(state, constructionPointsFor('office') * 6 + STEPS_PER_HOUR);
    expect(state.sites[id]).toBeUndefined();
    expect(state.units[id]).toBeDefined();
    expect(state.units[id]).not.toHaveProperty('priority');
  });

  it('refuses a bad priority payload and an id that is not a site', () => {
    const state = buildOffice(startOfDay(tower(), 0, 7), 0);
    const run = (command: unknown) =>
      step(state, [{ id: 'p1', command: command as Command }], 0).results[0];
    expect(run({ type: 'setSitePriority', unitId: 'u999', priority: true })).toMatchObject({
      ok: false,
      error: 'UNKNOWN_ENTITY',
    });
    expect(run({ type: 'setSitePriority', unitId: 'u1', priority: 'yes' })).toMatchObject({
      ok: false,
      error: 'INVALID_COMMAND',
    });
  });
});

describe('demolishing a site', () => {
  it('pays a site with no work yet back and frees the cells', () => {
    const state = buildOffice(startOfDay(tower(), 0, 7), 0);
    const id = Object.keys(state.sites)[0] as string;
    const command: QueuedCommand = {
      id: 'c3',
      command: { type: 'demolish', target: { kind: 'unit', id } } as Command,
    };
    const { state: after, results } = step(state, [command], 0);
    expect(results[0]).toMatchObject({ ok: true });
    expect(after.sites[id]).toBeUndefined();
    expect(after.money).toBeGreaterThan(state.money);
  });
});
