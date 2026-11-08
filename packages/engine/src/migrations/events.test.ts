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
    openBombThreat({ state: tower, events: [] }, 200_000);
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

  it('keeps notices and refuses malformed ones', () => {
    const tower = createTower(2);
    tower.notices.push({ id: 'n5.0', step: 5, key: 'news.starsUp', unitId: null });
    expect(migrateState(roundTrip(tower))).toEqual(tower);
    const saved = roundTrip(tower) as object;
    expect(() => migrateState({ ...saved, notices: [{ id: 'n5.0' }] })).toThrow(
      StateMigrationError,
    );
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
