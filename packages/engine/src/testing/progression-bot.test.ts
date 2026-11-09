import { UNIT_CATALOG } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { hashState } from '../hash';
import { runProgression } from './progression-bot';
import { formatProgressionReport } from './progression-report';
import { growthSlots, levelSlots } from './progression-layout';

describe('progression bot', () => {
  it('plays the same seed to the same tower and report', () => {
    const first = runProgression({ seed: 3, maxDays: 3 });
    const second = runProgression({ seed: 3, maxDays: 3 });
    expect(hashState(second.state)).toBe(hashState(first.state));
    expect(formatProgressionReport([second], 3)).toBe(formatProgressionReport([first], 3));
  });

  it('starts the tower with a lobby, a shaft and leased offices', () => {
    const run = runProgression({ seed: 1, maxDays: 2 });
    const offices = Object.values(run.state.units).filter((unit) => unit.type === 'office');
    expect(Object.keys(run.state.shafts)).toHaveLength(1);
    expect(offices.length).toBeGreaterThan(10);
    expect(offices.some((unit) => unit.lease !== null)).toBe(true);
    expect(run.failedCommands).toEqual({});
  });
});

describe('progression layout', () => {
  it('never plans two units on the same cells', () => {
    for (let level = 2; level <= 100; level++) {
      const taken = new Set<number>();
      for (const slot of levelSlots(level)) {
        const width = UNIT_CATALOG[slot.type].width;
        for (let x = slot.x; x < slot.x + width; x++) {
          expect(taken.has(x)).toBe(false);
          taken.add(x);
        }
      }
    }
  });

  it('grows each zone next to the core first', () => {
    const [first] = growthSlots(0);
    expect(first).toMatchObject({ x: 214, level: 2 });
  });
});
