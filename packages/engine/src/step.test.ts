import type { QueuedCommand, TowerState } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { STEPS_PER_DAY } from './clock';
import { hashState } from './hash';
import { chance } from './rng';
import { createTower } from './state';
import { createEngine, runDays, step, type EngineRules } from './step';

const testRules: EngineRules = {
  commandHandlers: {
    buildFloor(context, command) {
      if (command.x1 < command.x0) {
        return { ok: false, error: 'OUT_OF_BOUNDS' };
      }
      context.state.nextId += command.x1 - command.x0 + 1;
      return { ok: true, cost: 500 * (command.x1 - command.x0 + 1), refund: 0, events: [] };
    },
  },
  systems: [
    (context) => {
      if (chance(context.state.rng, 0.01)) {
        context.state.nextId += 1;
      }
    },
  ],
};

const testEngine = createEngine(testRules);

function floor(id: string, x0: number, x1: number): QueuedCommand {
  return { id, command: { type: 'buildFloor', level: 2, x0, x1 } };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe('step', () => {
  it('advances the step counter by the requested count', () => {
    expect(step(createTower(1), [], 0).state.step).toBe(0);
    expect(step(createTower(1), [], 1).state.step).toBe(1);
    expect(step(createTower(1), [], 250).state.step).toBe(250);
  });

  it('never mutates the input state', () => {
    const tower = deepFreeze(createTower(1));
    const before = hashState(tower);
    testEngine.step(tower, [floor('c1', 0, 4)], 100);
    expect(hashState(tower)).toBe(before);
  });

  it('gives the same result for the same state, commands and step count', () => {
    const commands = [floor('c1', 0, 9), floor('c2', 5, 1), floor('c3', 10, 12)];
    const first = testEngine.step(createTower(2026), commands, STEPS_PER_DAY);
    const second = testEngine.step(createTower(2026), commands, STEPS_PER_DAY);
    expect(hashState(first)).toBe(hashState(second));
    expect(first).toEqual(second);
  });

  it('diverges for a different seed', () => {
    const first = testEngine.runDays(createTower(1), 1);
    const second = testEngine.runDays(createTower(2), 1);
    expect(hashState(first.state)).not.toBe(hashState(second.state));
  });

  it('gives the same state whether run in one call or many', () => {
    const inOneCall = testEngine.step(createTower(7), [], 1000).state;
    let inSmallCalls: TowerState = createTower(7);
    for (let call = 0; call < 1000; call++) {
      inSmallCalls = testEngine.step(inSmallCalls, [], 1).state;
    }
    expect(hashState(inSmallCalls)).toBe(hashState(inOneCall));
  });

  it('survives a JSON round trip between calls', () => {
    const halfway = testEngine.step(createTower(3), [], 500).state;
    const restored = JSON.parse(JSON.stringify(halfway)) as TowerState;
    expect(hashState(testEngine.step(restored, [], 500).state)).toBe(
      hashState(testEngine.step(createTower(3), [], 1000).state),
    );
  });

  it('returns one result per command, in order, stamped with the current step', () => {
    const tower = testEngine.step(createTower(1), [], 30).state;
    const { results } = testEngine.step(tower, [floor('a', 0, 1), floor('b', 3, 2)], 5);
    expect(results).toEqual([
      { id: 'a', ok: true, step: 30, cost: 1000, refund: 0 },
      { id: 'b', ok: false, step: 30, error: 'OUT_OF_BOUNDS' },
    ]);
  });

  it('applies commands in order before simulating, each seeing the previous one', () => {
    const tower = createTower(1);
    const { state } = testEngine.step(tower, [floor('a', 0, 1), floor('b', 0, 2)], 0);
    expect(state.nextId).toBe(tower.nextId + 2 + 3);
  });

  it('leaves the state untouched by a rejected command', () => {
    const tower = createTower(1);
    const { state } = testEngine.step(tower, [floor('bad', 4, 0)], 0);
    expect(state).toEqual(tower);
  });

  it('rejects a command that has no handler yet', () => {
    const { results, state } = step(createTower(1), [floor('c1', 0, 4)], 0);
    expect(results).toEqual([{ id: 'c1', ok: false, step: 0, error: 'INVALID_COMMAND' }]);
    expect(state).toEqual(createTower(1));
  });

  it.each([
    ['a null command', null],
    ['a command without a type', { name: 'x' }],
    ['an unknown type', { type: 'launchRocket' }],
    ['an inherited property as type', { type: 'toString' }],
    ['an array', ['renameUnit']],
  ])('rejects %s as INVALID_COMMAND without changing the state', (_label, command) => {
    const tower = createTower(1);
    const before = hashState(tower);
    const malformed = { id: 'm1', command } as unknown as QueuedCommand;
    const { state, results, events } = testEngine.step(tower, [malformed], 0);
    expect(results).toEqual([{ id: 'm1', ok: false, step: 0, error: 'INVALID_COMMAND' }]);
    expect(hashState(state)).toBe(before);
    expect(events).toEqual([]);
  });

  it('keeps going after a rejected command', () => {
    const malformed = { id: 'm1', command: { type: 'nope' } } as unknown as QueuedCommand;
    const { results } = testEngine.step(createTower(1), [malformed, floor('ok', 0, 1)], 0);
    expect(results.map((result) => result.ok)).toEqual([false, true]);
  });

  it('discards what a rejecting handler changed before it rejected', () => {
    const engine = createEngine({
      commandHandlers: {
        buildFloor(context) {
          context.state.nextId += 100;
          return { ok: false, error: 'NO_SUPPORT' };
        },
      },
      systems: [],
    });
    const tower = createTower(1);
    const { state, results } = engine.step(tower, [floor('c1', 0, 1)], 0);
    expect(results[0]).toMatchObject({ ok: false, error: 'NO_SUPPORT' });
    expect(hashState(state)).toBe(hashState(tower));
  });

  it('stamps command events with the step and the command id', () => {
    const engine = createEngine({
      commandHandlers: {
        renameUnit(_context, command) {
          return {
            ok: true,
            cost: 0,
            refund: 0,
            events: [{ type: 'unitRenamed', unitId: command.unitId, name: command.name }],
          };
        },
      },
      systems: [],
    });
    const tower = step(createTower(1), [], 12).state;
    const command: QueuedCommand = {
      id: 'r7',
      command: { type: 'renameUnit', unitId: 'u1', name: 'A' },
    };
    expect(engine.step(tower, [command], 3).events).toEqual([
      { type: 'unitRenamed', step: 12, commandId: 'r7', unitId: 'u1', name: 'A' },
    ]);
  });

  it('rejects a negative or fractional step count', () => {
    expect(() => step(createTower(1), [], -1)).toThrow(RangeError);
    expect(() => step(createTower(1), [], 1.5)).toThrow(RangeError);
  });
});

describe('runDays', () => {
  it('advances exactly 8640 steps per day', () => {
    expect(runDays(createTower(1), 1).state.step).toBe(8640);
  });

  it('advances 60480 steps in seven days', () => {
    expect(runDays(createTower(1), 7).state.step).toBe(60_480);
  });

  it('continues from the current step', () => {
    const afterOneDay = runDays(createTower(1), 1).state;
    expect(runDays(afterOneDay, 2).state.step).toBe(3 * STEPS_PER_DAY);
  });

  it('rejects a negative or fractional day count', () => {
    expect(() => runDays(createTower(1), -1)).toThrow(RangeError);
    expect(() => runDays(createTower(1), 0.5)).toThrow(RangeError);
  });

  it('runs an empty-tower day in under 50 ms', () => {
    runDays(createTower(1), 1);
    const started = performance.now();
    runDays(createTower(1), 1);
    expect(performance.now() - started).toBeLessThan(50);
  });
});
