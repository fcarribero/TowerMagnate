import type { QueuedCommand } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { addPerson, renamePerson } from '../people';
import { createTower } from '../state';
import { step } from '../step';

function towerWithPeople(count: number) {
  const state = createTower(3);
  for (let index = 0; index < count; index++) {
    const id = addPerson(state, { kind: 'resident', homeUnit: 0, level: 1, column: 0 });
    renamePerson(state.people, id, `Persona ${id}`);
  }
  return state;
}

function follow(personId: string, id = personId): QueuedCommand {
  return { id: `follow-${id}`, command: { type: 'followPerson', personId } };
}

describe('followPerson and unfollowPerson commands', () => {
  it('follows 20 people and rejects the 21st with FOLLOW_LIMIT', () => {
    const commands = Array.from({ length: 21 }, (_, index) => follow(`p${index + 1}`));
    const result = step(towerWithPeople(21), commands, 0);
    expect(result.results.slice(0, 20).every((outcome) => outcome.ok)).toBe(true);
    expect(result.results[20]).toMatchObject({ ok: false, error: 'FOLLOW_LIMIT' });
    expect(result.state.people.followed).toHaveLength(20);
  });

  it('frees a place when someone is unfollowed', () => {
    const commands: QueuedCommand[] = [
      ...Array.from({ length: 20 }, (_, index) => follow(`p${index + 1}`)),
      { id: 'drop', command: { type: 'unfollowPerson', personId: 'p4' } },
      follow('p21'),
    ];
    const result = step(towerWithPeople(21), commands, 0);
    expect(result.results.every((outcome) => outcome.ok)).toBe(true);
    expect(result.state.people.followed).not.toContain(4);
    expect(result.state.people.followed).toContain(21);
  });

  it('rejects a person with no name', () => {
    const state = towerWithPeople(1);
    addPerson(state, { kind: 'resident', homeUnit: 0, level: 1, column: 0 });
    const result = step(state, [follow('p2')], 0);
    expect(result.results[0]).toMatchObject({ ok: false, error: 'INVALID_COMMAND' });
  });

  it('rejects unknown people and malformed ids', () => {
    const result = step(
      towerWithPeople(1),
      [
        follow('p9'),
        { id: 'bad', command: { type: 'followPerson', personId: 'u1' } },
        { id: 'gone', command: { type: 'unfollowPerson', personId: 'p9' } },
      ],
      0,
    );
    expect(result.results.map((outcome) => outcome.ok || outcome.error)).toEqual([
      'UNKNOWN_ENTITY',
      'INVALID_COMMAND',
      'UNKNOWN_ENTITY',
    ]);
  });
});
