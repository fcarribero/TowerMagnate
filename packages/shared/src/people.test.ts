import { describe, expect, it } from 'vitest';
import { CONDO_HOUSEHOLD_SIZES, CONDO_PAIR_CHILD_CHANCE, CONDO_TRIO_CHILDREN } from './balance';
import { PERSON_KINDS } from './people';
import { packPerson, PackedPersonSchema, unpackPerson } from './protocol/packed';
import { PersonKindSchema } from './protocol/primitives';

describe('child kind', () => {
  it('is stored after every older kind, so stored codes stay valid', () => {
    // The cleaner and then the doctor came after the child; kinds are only ever added at the end.
    expect(PERSON_KINDS.indexOf('child')).toBe(PERSON_KINDS.length - 3);
    expect(PERSON_KINDS.indexOf('cleaner')).toBe(PERSON_KINDS.length - 2);
    expect(PERSON_KINDS.indexOf('doctor')).toBe(PERSON_KINDS.length - 1);
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

  it('keeps police in the stored slot of the old guard kind and packs the uniform outfit', () => {
    expect(PERSON_KINDS.indexOf('police')).toBe(7);
    const officer = {
      id: 'p9',
      kind: 'police',
      x: 4,
      level: 2,
      facing: 'left',
      mode: 'walk',
      carRef: null,
      stress: 'normal',
      outfit: 'uniform',
    } as const;
    const packed = packPerson(officer);
    expect(PackedPersonSchema.parse(JSON.parse(JSON.stringify(packed)))).toEqual(packed);
    expect(unpackPerson(packed)).toEqual(officer);
    const civilian = { ...officer, outfit: undefined };
    expect(unpackPerson(packPerson(civilian))).not.toHaveProperty('outfit');
    const bagAndUniform = { ...officer, carrying: true };
    expect(unpackPerson(packPerson(bagAndUniform))).toEqual(bagAndUniform);
  });

  it('has household constants that give 1 to 3 people', () => {
    expect(CONDO_HOUSEHOLD_SIZES).toHaveLength(3);
    expect(CONDO_TRIO_CHILDREN).toBe(1);
    expect(CONDO_PAIR_CHILD_CHANCE).toBeCloseTo(0.3);
  });
});
