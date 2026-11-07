import type { QueuedCommand, TowerState } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { hashState } from '../hash';
import { createTower } from '../state';
import { step } from '../step';

function towerWithOffice(): TowerState {
  const tower = createTower(1);
  tower.units.u1 = { id: 'u1', type: 'office', x: 10, level: 2, name: null };
  return tower;
}

function rename(id: string, unitId: string, name: string): QueuedCommand {
  return { id, command: { type: 'renameUnit', unitId, name } };
}

describe('renameUnit', () => {
  it('stores the trimmed name and reports it in an event with the command id', () => {
    const { state, results, events } = step(
      towerWithOffice(),
      [rename('c1', 'u1', '  Sosa SA ')],
      0,
    );
    expect(state.units.u1?.name).toBe('Sosa SA');
    expect(results).toEqual([{ id: 'c1', ok: true, step: 0, cost: 0, refund: 0 }]);
    expect(events).toEqual([
      { type: 'unitRenamed', step: 0, commandId: 'c1', unitId: 'u1', name: 'Sosa SA' },
    ]);
  });

  it('limits the name to 24 characters', () => {
    const { state } = step(towerWithOffice(), [rename('c1', 'u1', 'x'.repeat(40))], 0);
    expect(state.units.u1?.name).toBe('x'.repeat(24));
  });

  it('clears the name back to the default with a blank name', () => {
    const named = step(towerWithOffice(), [rename('c1', 'u1', 'Sosa SA')], 0).state;
    const { state, events } = step(named, [rename('c2', 'u1', '   ')], 0);
    expect(state.units.u1?.name).toBeNull();
    expect(events[0]).toMatchObject({ commandId: 'c2', name: null });
  });

  it('rejects an unknown unit without touching the state', () => {
    const tower = towerWithOffice();
    const before = hashState(tower);
    const { state, results, events } = step(tower, [rename('c1', 'u99', 'Sosa SA')], 0);
    expect(results).toEqual([{ id: 'c1', ok: false, step: 0, error: 'UNKNOWN_ENTITY' }]);
    expect(hashState(state)).toBe(before);
    expect(events).toEqual([]);
  });

  it('does not treat inherited object keys as units', () => {
    const { results } = step(towerWithOffice(), [rename('c1', 'constructor', 'x')], 0);
    expect(results[0]).toMatchObject({ ok: false, error: 'UNKNOWN_ENTITY' });
  });

  it.each([
    ['a missing name', { type: 'renameUnit', unitId: 'u1' }],
    ['a numeric name', { type: 'renameUnit', unitId: 'u1', name: 42 }],
    ['a null unit id', { type: 'renameUnit', unitId: null, name: 'Sosa SA' }],
  ])('rejects %s as INVALID_COMMAND', (_label, command) => {
    const tower = towerWithOffice();
    const before = hashState(tower);
    const malformed = { id: 'c1', command } as unknown as QueuedCommand;
    const { state, results } = step(tower, [malformed], 0);
    expect(results).toEqual([{ id: 'c1', ok: false, step: 0, error: 'INVALID_COMMAND' }]);
    expect(hashState(state)).toBe(before);
  });
});
