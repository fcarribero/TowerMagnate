import { describe, expect, it } from 'vitest';
import { openBombThreat, openFire } from '../events/decisions';
import { createTower } from '../state';
import { VERSION_1_SAVE } from './fixtures';
import { migrateState, StateMigrationError } from './index';

function roundTrip(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

describe('migrateState events', () => {
  it('gives a tower saved before events no events, closed decisions or treasure', () => {
    const state = migrateState(JSON.parse(VERSION_1_SAVE));
    expect(state.activeEvents).toEqual([]);
    expect(state.closedDecisions).toEqual([]);
    expect(state.treasureLevels).toEqual([]);
  });

  it('keeps a bomb threat, a closed fire and treasure levels', () => {
    const tower = createTower(2);
    const fire = openFire({ state: tower, events: [] }, 5);
    tower.activeEvents = [];
    tower.closedDecisions.push(fire?.id ?? '');
    openBombThreat({ state: tower, events: [] }, 200_000, { x: 0, level: 2 });
    tower.treasureLevels.push(-3, -1);
    expect(migrateState(roundTrip(tower))).toEqual(tower);
  });

  it('gives an older save no notices and puts its fire on level 1', () => {
    const tower = createTower(2);
    openFire({ state: tower, events: [] }, 5);
    const old = roundTrip(tower) as Record<string, unknown> & { activeEvents: object[] };
    delete old.notices;
    for (const event of old.activeEvents) {
      delete (event as { level?: number }).level;
    }
    old.schemaVersion = 14;
    const state = migrateState(old);
    expect(state.notices).toEqual([]);
    expect(state.activeEvents[0]).toMatchObject({ kind: 'fire', level: 1 });
  });

  it('gives a version 15 save a bomb with no search and a fire with no burning levels', () => {
    const tower = createTower(2);
    openBombThreat({ state: tower, events: [] }, 200_000, { x: 0, level: 2 });
    const old = roundTrip(tower) as Record<string, unknown> & { activeEvents: object[] };
    for (const event of old.activeEvents) delete (event as { search?: unknown }).search;
    old.schemaVersion = 15;
    expect(migrateState(old).activeEvents[0]).toMatchObject({ kind: 'bomb', search: null });

    const burning = createTower(2);
    openFire({ state: burning, events: [] }, 5);
    const oldFire = roundTrip(burning) as Record<string, unknown> & { activeEvents: object[] };
    for (const event of oldFire.activeEvents) {
      delete (event as { levels?: unknown }).levels;
      delete (event as { guards?: unknown }).guards;
    }
    oldFire.schemaVersion = 15;
    expect(migrateState(oldFire).activeEvents[0]).toMatchObject({ levels: {}, guards: {} });
  });

  it('gives a version 20 bomb a cell on its search level, or on level 1 before the search', () => {
    const tower = createTower(2);
    const bomb = openBombThreat({ state: tower, events: [] }, 200_000, { x: 40, level: 6 });
    if (!bomb) throw new Error('Expected a bomb threat');
    const waiting = roundTrip(tower) as Record<string, unknown> & { activeEvents: object[] };
    for (const event of waiting.activeEvents) delete (event as { bomb?: unknown }).bomb;
    waiting.schemaVersion = 20;
    expect(migrateState(waiting).activeEvents[0]).toMatchObject({ bomb: { x: 0, level: 1 } });

    bomb.search = { bombLevel: 6, levels: { 6: 'unsearched' }, guards: {}, unreachable: {} };
    const searching = roundTrip(tower) as Record<string, unknown> & { activeEvents: object[] };
    for (const event of searching.activeEvents) delete (event as { bomb?: unknown }).bomb;
    searching.schemaVersion = 20;
    expect(migrateState(searching).activeEvents[0]).toMatchObject({ bomb: { x: 0, level: 6 } });
  });

  it('refuses a bomb cell off the site', () => {
    const tower = createTower(2);
    openBombThreat({ state: tower, events: [] }, 200_000, { x: 0, level: 2 });
    const saved = roundTrip(tower) as { activeEvents: Record<string, unknown>[] };
    const offSite = { ...saved.activeEvents[0], bomb: { x: 375, level: 2 } };
    expect(() => migrateState({ ...saved, activeEvents: [offSite] })).toThrow(StateMigrationError);
  });

  it('keeps a bomb search and a fire with burning levels and guards', () => {
    const tower = createTower(2);
    const bomb = openBombThreat({ state: tower, events: [] }, 200_000, { x: 0, level: 2 });
    if (!bomb) throw new Error('Expected a bomb threat');
    bomb.search = {
      bombLevel: 4,
      levels: { 2: 'searched', 3: 'taken', 4: 'unsearched' },
      guards: { 7: { level: 3, endStep: null }, 8: { level: 2, endStep: 99 } },
      unreachable: { 7: [9] },
    };
    expect(migrateState(roundTrip(tower))).toEqual(tower);

    const burning = createTower(2);
    const fire = openFire({ state: burning, events: [] }, 5);
    if (!fire) throw new Error('Expected a fire');
    const front = { x: 30, progress: 3, out: false };
    fire.levels[5] = { ignitionStep: 10, ignitionColumn: 30, left: front, right: { ...front } };
    fire.guards = {
      7: { level: 5, side: 'left', arrivedStep: 12 },
      8: { level: 5, side: null, arrivedStep: null },
    };
    expect(migrateState(roundTrip(burning))).toEqual(burning);
  });

  it('refuses a malformed search or fire guard', () => {
    const tower = createTower(2);
    const bomb = openBombThreat({ state: tower, events: [] }, 200_000, { x: 0, level: 2 });
    if (!bomb) throw new Error('Expected a bomb threat');
    const saved = roundTrip(tower) as { activeEvents: Record<string, unknown>[] };
    const badLevel = {
      ...saved.activeEvents[0],
      search: { bombLevel: 0, levels: {}, guards: {}, unreachable: {} },
    };
    expect(() => migrateState({ ...saved, activeEvents: [badLevel] })).toThrow(StateMigrationError);
    const burning = createTower(2);
    openFire({ state: burning, events: [] }, 5);
    const fireSaved = roundTrip(burning) as { activeEvents: Record<string, unknown>[] };
    const badGuard = {
      ...fireSaved.activeEvents[0],
      guards: { 7: { level: 5, side: 'up', arrivedStep: null } },
    };
    expect(() => migrateState({ ...fireSaved, activeEvents: [badGuard] })).toThrow(
      StateMigrationError,
    );
  });

  it('keeps notices and refuses malformed ones', () => {
    const tower = createTower(2);
    tower.notices.push({
      id: 'n5.0',
      step: 5,
      key: 'news.starsUp',
      unitId: null,
      params: { n: 2 },
    });
    expect(migrateState(roundTrip(tower))).toEqual(tower);
    const saved = roundTrip(tower) as object;
    expect(() => migrateState({ ...saved, notices: [{ id: 'n5.0' }] })).toThrow(
      StateMigrationError,
    );
  });

  it('gives a notice saved without params no params', () => {
    const tower = createTower(2);
    tower.notices.push({ id: 'n5.0', step: 5, key: 'news.officeLeft', unitId: 'u1', params: {} });
    const saved = roundTrip(tower) as { notices: Record<string, unknown>[] };
    delete saved.notices[0]?.params;
    expect(migrateState(saved).notices).toEqual(tower.notices);
    const badLevel = { ...saved.notices[0], params: { level: 'S3' } };
    expect(() => migrateState({ ...saved, notices: [badLevel] })).toThrow(StateMigrationError);
  });

  it('refuses malformed events', () => {
    const tower = createTower(2);
    openFire({ state: tower, events: [] }, 5);
    const saved = roundTrip(tower) as { activeEvents: Record<string, unknown>[] };
    const fire = saved.activeEvents[0] ?? {};

    const badChoice = { ...fire, decision: { ...(fire.decision as object), choice: 'pay' } };
    const badKind = { ...fire, kind: 'flood' };
    const noStart = { ...fire, startStep: undefined };
    for (const activeEvents of [[badChoice], [badKind], [noStart], 'fire']) {
      expect(() => migrateState({ ...saved, activeEvents })).toThrow(StateMigrationError);
    }
    expect(() => migrateState({ ...saved, closedDecisions: [1] })).toThrow(StateMigrationError);
    expect(() => migrateState({ ...saved, treasureLevels: [2] })).toThrow(StateMigrationError);
  });
});

describe('migrateState VIP dry days', () => {
  it('gives a version 34 save a counter of 0 and keeps a saved one', () => {
    const old = roundTrip(createTower(4)) as Record<string, unknown>;
    delete old.vipDryDays;
    old.schemaVersion = 34;
    expect(migrateState(old).vipDryDays).toBe(0);
    const saved = roundTrip({ ...createTower(4), vipDryDays: 6 });
    expect(migrateState(saved).vipDryDays).toBe(6);
  });

  it('refuses a counter that is not a whole number', () => {
    const saved = roundTrip(createTower(4)) as Record<string, unknown>;
    for (const vipDryDays of [-1, 1.5, '3', undefined]) {
      expect(() => migrateState({ ...saved, vipDryDays })).toThrow(StateMigrationError);
    }
  });
});

describe('migrateState VIP visit', () => {
  it('gives a version 30 save no VIP visit', () => {
    const old = roundTrip(createTower(4)) as Record<string, unknown>;
    delete old.vipVisit;
    old.schemaVersion = 30;
    expect(migrateState(old).vipVisit).toBeNull();
  });

  it('keeps a visit under way and refuses a malformed one', () => {
    const tower = createTower(4);
    tower.vipVisit = {
      id: 'e3',
      day: 12,
      startedAtStars: 3,
      unitId: 'u7',
      personId: 41,
      outcome: 'pending',
    };
    expect(migrateState(roundTrip(tower))).toEqual(tower);
    const saved = roundTrip(tower) as Record<string, unknown>;
    const visit = tower.vipVisit;
    for (const bad of [
      { startedAtStars: 7 },
      { unitId: 'p7' },
      { personId: -1 },
      { outcome: 'maybe' },
      { day: 1.5 },
    ]) {
      expect(() => migrateState({ ...saved, vipVisit: { ...visit, ...bad } })).toThrow(
        StateMigrationError,
      );
    }
    expect(() => migrateState({ ...saved, vipVisit: undefined })).toThrow(StateMigrationError);
  });
});
