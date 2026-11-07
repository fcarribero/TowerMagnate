import { describe, expect, it } from 'vitest';
import { STEPS_PER_DAY } from '../clock';
import { createEngine } from '../step';
import { runScenario } from './scenario';

describe('runScenario', () => {
  it('runs the requested number of days from a fresh tower', () => {
    const run = runScenario({ seed: 3, days: 7 });
    expect(run.state.step).toBe(7 * STEPS_PER_DAY);
  });

  it('feeds each scripted command in on its day', () => {
    const seenAtStep: number[] = [];
    const engine = createEngine({
      commandHandlers: {
        buildFloor(context) {
          seenAtStep.push(context.state.step);
          return { ok: true, cost: 0, refund: 0 };
        },
      },
      systems: [],
    });
    const command = { type: 'buildFloor', level: 1, x0: 0, x1: 3 } as const;
    const run = runScenario({
      days: 3,
      engine,
      script: [
        { day: 0, command },
        { day: 2, command },
      ],
    });
    expect(seenAtStep).toEqual([0, 2 * STEPS_PER_DAY]);
    expect(run.results.map((result) => result.id)).toEqual(['s1', 's2']);
  });

  it('refuses a scripted command after the last day', () => {
    const command = { type: 'buildFloor', level: 1, x0: 0, x1: 3 } as const;
    expect(() => runScenario({ days: 2, script: [{ day: 2, command }] })).toThrow(RangeError);
  });

  it('runs a game week of an empty tower well inside the CI budget', () => {
    const started = performance.now();
    runScenario({ days: 7 });
    expect(performance.now() - started).toBeLessThan(2000);
  });
});
