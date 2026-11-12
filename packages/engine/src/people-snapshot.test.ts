import { describe, expect, it } from 'vitest';
import { hashState } from './hash';
import { createPeopleSystem, peopleCount } from './people';
import { deserializeState, serializeState } from './serialization';
import { createEngine } from './step';
import { SNAPSHOT_PEOPLE, towerWithPeople } from './testing';

const FOLLOWING_STEPS = 1_000;

const engine = createEngine({
  commandHandlers: {},
  systems: [createPeopleSystem(() => undefined)],
});

describe('person pool snapshot at 20,000 people', () => {
  const original = towerWithPeople(SNAPSHOT_PEOPLE);
  const restored = deserializeState(serializeState(original));

  it('restores an identical pool', () => {
    expect(peopleCount(restored.people)).toBe(SNAPSHOT_PEOPLE);
    expect(restored.people).toEqual(original.people);
    expect(hashState(restored)).toBe(hashState(original));
  });

  it('runs the next 1,000 steps to the same state hash', () => {
    const fromOriginal = engine.step(original, [], FOLLOWING_STEPS).state;
    const fromRestored = engine.step(restored, [], FOLLOWING_STEPS).state;
    expect(hashState(fromRestored)).toBe(hashState(fromOriginal));
  });
});
