import type { QueuedCommand } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { addPerson, nameOfPerson } from '../people';
import { createTower } from '../state';
import { step } from '../step';

function towerWithPerson() {
  const state = createTower(3);
  addPerson(state, { kind: 'officeWorker', homeUnit: 0, level: 2, column: 5 });
  return state;
}

function rename(personId: string, name: string): QueuedCommand {
  return { id: `rename-${personId}`, command: { type: 'renamePerson', personId, name } };
}

describe('renamePerson command', () => {
  it('stores a trimmed name for free', () => {
    const result = step(towerWithPerson(), [rename('p1', '  Ana   Pérez ')], 0);
    expect(result.results[0]).toMatchObject({ ok: true, cost: 0 });
    expect(nameOfPerson(result.state.people, 1)).toBe('Ana Pérez');
  });

  it('cuts the name to 24 characters', () => {
    const result = step(towerWithPerson(), [rename('p1', 'x'.repeat(40))], 0);
    expect(nameOfPerson(result.state.people, 1)).toBe('x'.repeat(24));
  });

  it('clears the name with an empty text and unfollows the person', () => {
    const named = step(
      towerWithPerson(),
      [rename('p1', 'Ana'), { id: 'f', command: { type: 'followPerson', personId: 'p1' } }],
      0,
    );
    expect(named.state.people.followed).toEqual([1]);
    const cleared = step(named.state, [rename('p1', '   ')], 0);
    expect(nameOfPerson(cleared.state.people, 1)).toBeNull();
    expect(cleared.state.people.followed).toEqual([]);
  });

  it('rejects unknown people and malformed ids', () => {
    const result = step(towerWithPerson(), [rename('p9', 'Ana'), rename('u1', 'Ana')], 0);
    expect(result.results.map((outcome) => outcome.ok || outcome.error)).toEqual([
      'UNKNOWN_ENTITY',
      'INVALID_COMMAND',
    ]);
  });
});
