import type { QueuedCommand, TowerState } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { STEPS_PER_DAY } from './clock';
import { towerCommandHandlers } from './commands';
import { hashState } from './hash';
import { StateMigrationError } from './migrations';
import { chance, nextInt } from './rng';
import { deserializeState, serializeState } from './serialization';
import { createTower, SCHEMA_VERSION } from './state';
import { createEngine } from './step';

const engine = createEngine({
  commandHandlers: towerCommandHandlers,
  systems: [
    (context) => {
      if (chance(context.state.rng, 0.01)) {
        context.state.nextId += nextInt(context.state.rng, 1, 3);
      }
    },
  ],
});

function sampleTower(): TowerState {
  const tower = createTower(20261116);
  tower.units = {
    u1: { id: 'u1', type: 'office', x: 10, level: 1, name: null },
    u2: { id: 'u2', type: 'fast-food', x: 30, level: -1, name: 'Pancho' },
    u3: { id: 'u3', type: 'condo', x: 50, level: 12, name: null },
  };
  tower.nextId = 4;
  return tower;
}

function playFirstDay(): TowerState {
  const renames: QueuedCommand[] = [
    { id: 'c1', command: { type: 'renameUnit', unitId: 'u1', name: 'Oficinas Sur' } },
  ];
  const started = engine.step(sampleTower(), renames, 0).state;
  return engine.runDays(started, 1).state;
}

describe('serializeState and deserializeState', () => {
  it('round-trips a tower after one day with an equal hash', () => {
    const afterOneDay = playFirstDay();
    const restored = deserializeState(serializeState(afterOneDay));
    expect(afterOneDay.step).toBe(STEPS_PER_DAY);
    expect(afterOneDay.units.u1?.name).toBe('Oficinas Sur');
    expect(restored).toEqual(afterOneDay);
    expect(hashState(restored)).toBe(hashState(afterOneDay));
  });

  it('runs a restored tower exactly like one that was never saved', () => {
    const afterOneDay = playFirstDay();
    const uninterrupted = engine.runDays(afterOneDay, 1).state;
    const restored = engine.runDays(deserializeState(serializeState(afterOneDay)), 1).state;
    expect(hashState(restored)).toBe(hashState(uninterrupted));
  });

  it('writes the schema version into the saved text', () => {
    expect(JSON.parse(serializeState(createTower(1)))).toMatchObject({
      schemaVersion: SCHEMA_VERSION,
    });
  });

  it('keeps an empty tower under 5 KB', () => {
    expect(serializeState(createTower(1)).length).toBeLessThan(5 * 1024);
  });
});

describe('deserializeState errors', () => {
  function savedWithVersion(version: unknown): string {
    return JSON.stringify({ ...createTower(1), schemaVersion: version });
  }

  it('names a version newer than the engine', () => {
    expect(() => deserializeState(savedWithVersion(SCHEMA_VERSION + 1))).toThrow(
      new StateMigrationError(
        `State schema version ${SCHEMA_VERSION + 1} is newer than this engine (${SCHEMA_VERSION})`,
      ),
    );
  });

  it('names a version that cannot exist', () => {
    for (const version of [0, -3, 1.5, '1', null]) {
      expect(() => deserializeState(savedWithVersion(version))).toThrow(
        new StateMigrationError(`Unknown schema version ${String(version)}`),
      );
    }
  });

  it('says when the version is missing', () => {
    const withoutVersion: Record<string, unknown> = { ...createTower(1) };
    delete withoutVersion.schemaVersion;
    expect(() => deserializeState(JSON.stringify(withoutVersion))).toThrow(
      new StateMigrationError('State has no schema version'),
    );
  });

  it('refuses text that is not JSON', () => {
    expect(() => deserializeState('{"schemaVersion": 1,')).toThrow(
      new StateMigrationError('Saved state is not valid JSON'),
    );
  });
});
