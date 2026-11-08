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
    const fire = openFire({ state: tower, events: [] });
    tower.activeEvents = [];
    tower.closedDecisions.push(fire?.id ?? '');
    openBombThreat({ state: tower, events: [] }, 200_000);
    tower.treasureLevels.push(-3, -1);
    expect(migrateState(roundTrip(tower))).toEqual(tower);
  });

  it('refuses malformed events', () => {
    const tower = createTower(2);
    openFire({ state: tower, events: [] });
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
