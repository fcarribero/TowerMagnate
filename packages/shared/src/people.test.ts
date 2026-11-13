import { describe, expect, it } from 'vitest';
import { CONDO_HOUSEHOLD_SIZES, CONDO_PAIR_CHILD_CHANCE, CONDO_TRIO_CHILDREN } from './balance';
import { PERSON_KINDS } from './people';
import { packPerson, unpackPerson } from './protocol/packed';
import { PersonKindSchema } from './protocol/primitives';

describe('child kind', () => {
  it('is stored after every older kind, so stored codes stay valid', () => {
    expect(PERSON_KINDS.indexOf('child')).toBe(PERSON_KINDS.length - 1);
    expect(PERSON_KINDS.indexOf('child')).toBeGreaterThan(PERSON_KINDS.indexOf('courier'));
    expect(PERSON_KINDS.indexOf('officeWorker')).toBe(0);
    expect(PERSON_KINDS.indexOf('resident')).toBe(1);
  });

  it('is accepted by the protocol schema and packs and unpacks', () => {
    expect(PersonKindSchema.parse('child')).toBe('child');
    const child = {
      id: 'p9',
      kind: 'child',
      x: 12.5,
      level: 3,
      facing: 'right',
      mode: 'walk',
      carRef: null,
      stress: 'normal',
    } as const;
    expect(unpackPerson(packPerson(child))).toEqual(child);
  });

  it('has household constants that give 1 to 3 people', () => {
    expect(CONDO_HOUSEHOLD_SIZES).toHaveLength(3);
    expect(CONDO_TRIO_CHILDREN).toBe(1);
    expect(CONDO_PAIR_CHILD_CHANCE).toBeCloseTo(0.3);
  });
});
