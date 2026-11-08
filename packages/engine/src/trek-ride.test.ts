import type { Level, Shaft, TowerState } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { SECONDS_PER_STEP } from './clock';
import { createElevatorSystem } from './elevators';
import { hashState } from './hash';
import { addPerson, NOTHING_DUE, slotOfPerson } from './people';
import { TransportGraph } from './routing';
import { createEngine } from './step';
import { buildTower, plainTowerPlan, type PlannedShaft } from './testing';
import { cancelTrek, createTrekSystem, startTrek, trekPhaseAt } from './trek';

const engine = createEngine({
  commandHandlers: {},
  systems: [createTrekSystem(), createElevatorSystem()],
});

const shaft: PlannedShaft = { type: 'standard', x: 60, bottom: 1, top: 6 };
const SHAFT_COLUMN = 62;

function buildRideTower(): TowerState {
  return buildTower({ ...plainTowerPlan(6, 0, 99), shafts: [shaft] }).state;
}

function sendRider(state: TowerState, level: Level, to: { level: Level; column: number }): number {
  const id = addPerson(state, { kind: 'officeWorker', homeUnit: 0, level, column: SHAFT_COLUMN });
  const context = { state, events: [], graph: new TransportGraph(state) };
  startTrek(context, slotOfPerson(state.people, id), to);
  return id;
}

function personView(state: TowerState, id: number) {
  const slot = slotOfPerson(state.people, id);
  return {
    level: state.people.level[slot] as number,
    column: state.people.column[slot] as number,
    phase: trekPhaseAt(state.people, slot),
    dueStep: state.people.dueStep[slot] as number,
  };
}

function runUntilArrived(state: TowerState, id: number, limit: number): TowerState {
  let current = state;
  for (let count = 0; count < limit; count++) {
    if (personView(current, id).phase === 'idle') return current;
    current = engine.step(current, [], 1).state;
  }
  return current;
}

describe('elevator rides', () => {
  it('boards the car, rides up and gets off at the destination level', () => {
    const state = buildRideTower();
    const id = sendRider(state, 1, { level: 4, column: 30 });
    expect(personView(state, id).phase).toBe('queued');

    const riding = engine.step(state, [], 6).state;
    expect(personView(riding, id).phase).toBe('riding');
    const car = (Object.values(riding.shafts)[0] as Shaft).cars[0];
    expect(car?.riders).toHaveLength(1);

    const arrived = runUntilArrived(state, id, 600);
    expect(personView(arrived, id)).toMatchObject({ level: 4, column: 30, phase: 'idle' });
    expect(personView(arrived, id).dueStep).not.toBe(NOTHING_DUE);
    expect((Object.values(arrived.shafts)[0] as Shaft).cars[0]?.riders).toEqual([]);
  });

  it('rides down as well as up', () => {
    const state = buildRideTower();
    const id = sendRider(state, 5, { level: 2, column: 70 });
    const arrived = runUntilArrived(state, id, 600);
    expect(personView(arrived, id)).toMatchObject({ level: 2, column: 70, phase: 'idle' });
  });

  it('delivers several riders to different floors', () => {
    const state = buildRideTower();
    const ids = [3, 4, 5, 6].map((level) =>
      sendRider(state, 1, { level: level as Level, column: 20 }),
    );
    let current = state;
    for (let count = 0; count < 900; count++) current = engine.step(current, [], 1).state;
    for (const [index, id] of ids.entries()) {
      expect(personView(current, id)).toMatchObject({
        level: index + 3,
        column: 20,
        phase: 'idle',
      });
    }
  });

  it('takes a cancelled rider out of the car', () => {
    const state = buildRideTower();
    const id = sendRider(state, 1, { level: 6, column: 30 });
    const riding = engine.step(state, [], 6).state;
    const slot = slotOfPerson(riding.people, id);
    cancelTrek({ state: riding, events: [] }, slot);
    expect((Object.values(riding.shafts)[0] as Shaft).cars[0]?.riders).toEqual([]);
    expect(trekPhaseAt(riding.people, slot)).toBe('idle');
  });

  it('gives the same state for the same tower', () => {
    const run = () => {
      const state = buildRideTower();
      [2, 3, 4, 5, 6].forEach((level) =>
        sendRider(state, 1, { level: level as Level, column: 10 }),
      );
      return hashState(engine.step(state, [], 400).state);
    };
    expect(run()).toBe(run());
  });
});

describe('morning rush', () => {
  const WORKERS = 100;
  const STEPS_PER_HOUR = 3600 / SECONDS_PER_STEP;

  function rushTower(): { state: TowerState; ids: number[] } {
    const state = buildTower({
      ...plainTowerPlan(10, 0, 99),
      shafts: [{ type: 'standard', x: 60, bottom: 1, top: 10 }],
    }).state;
    const built = Object.values(state.shafts)[0] as Shaft;
    built.cars.push(structuredClone(built.cars[0] as Shaft['cars'][number]));
    const ids = Array.from({ length: WORKERS }, (_, index) =>
      sendRider(state, 1, { level: (2 + (index % 9)) as Level, column: 10 + (index % 40) }),
    );
    return { state, ids };
  }

  it('gets 100 workers to their floors within an hour on 1 shaft and 2 cars', () => {
    const { state, ids } = rushTower();
    const end = engine.step(state, [], STEPS_PER_HOUR).state;
    ids.forEach((id, index) => {
      expect(personView(end, id)).toMatchObject({ level: 2 + (index % 9), phase: 'idle' });
    });
  });

  it('steps 100 boarding workers within 1 ms on average and 5 ms at p99', () => {
    const timeRun = () => {
      const { state } = rushTower();
      const context = { state, events: [], graph: new TransportGraph(state) };
      const systems = [createTrekSystem(), createElevatorSystem()];
      const durations: number[] = [];
      for (let count = 0; count < 300; count++) {
        context.state.step += 1;
        const started = performance.now();
        for (const system of systems) system(context);
        durations.push(performance.now() - started);
      }
      durations.sort((a, b) => a - b);
      const average = durations.reduce((sum, value) => sum + value, 0) / durations.length;
      return { average, p99: durations[Math.floor(durations.length * 0.99)] as number };
    };
    const runs = [timeRun(), timeRun(), timeRun()];
    const median = (values: number[]) => [...values].sort((a, b) => a - b)[1] as number;
    expect(median(runs.map((run) => run.average))).toBeLessThan(1);
    expect(median(runs.map((run) => run.p99))).toBeLessThan(5);
  });
});
