import { describe, expect, it } from 'vitest';
import { listPeople } from '../people';
import { securityTower } from './security-scenario';

describe('security tower', () => {
  it('has 327 people, 105 of them police, with 5 security offices', () => {
    const people = listPeople(securityTower(5).people);
    const police = people.filter((person) => person.kind === 'police');
    expect(people).toHaveLength(327);
    expect(police).toHaveLength(105);
  });
});
