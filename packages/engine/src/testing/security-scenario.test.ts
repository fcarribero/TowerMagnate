import { describe, expect, it } from 'vitest';
import { listPeople } from '../people';
import { securityTower } from './security-scenario';

describe('security tower', () => {
  it('has 252 people, 30 of them guards, with 5 security offices', () => {
    const people = listPeople(securityTower(5).people);
    const guards = people.filter((person) => person.kind === 'guard');
    expect(people).toHaveLength(252);
    expect(guards).toHaveLength(30);
  });
});
