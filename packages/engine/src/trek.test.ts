import {
  ELEVATOR_QUEUE_CAPACITY,
  ESCALATOR_FLIGHT_STEPS,
  FULL_QUEUE_RECHECK_STEPS,
  ROUTE_RETRY_STEPS,
  STAIR_FLIGHT_STEPS,
  type Level,
  type PersonKind,
  type Shaft,
  type TowerState,
} from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { hashState } from './hash';
import { addPerson, NOTHING_DUE, personEntityId, slotOfPerson } from './people';
import { TransportGraph } from './routing';
import { createEngine, type StepContext } from './step';
import { addFlight, buildTower, plainTowerPlan, trekCrowd, type PlannedShaft } from './testing';
import {
  cancelTrek,
  createTrekSystem,
  isOnTrek,
  startTrek,
  trekPhaseAt,
  type TrekPlace,
} from './trek';

const engine = createEngine({ commandHandlers: {}, systems: [createTrekSystem()] });

const LOBBY_LEFT = 0;
const LOBBY_RIGHT = 99;
const FLIGHT_X = 20;
const FLIGHT_COLUMN = FLIGHT_X + 4;

interface Setup {
  floors: number;
  flights?: { type: 'stairs' | 'escalator'; from: Level; to: Level }[];
  shafts?: PlannedShaft[];
}

function buildTestTower({ floors, flights = [], shafts = [] }: Setup): TowerState {
  const plan = { ...plainTowerPlan(floors, LOBBY_LEFT, LOBBY_RIGHT), shafts };
  const { state } = buildTower(plan);
  for (const flight of flights) {
    for (let level = flight.from; level < flight.to; level++) {
      addFlight(state, flight.type, FLIGHT_X, level);
    }
  }
  return state;
}

function contextOf(state: TowerState): StepContext {
  return { state, events: [], graph: new TransportGraph(state) };
}

function addWalker(
  state: TowerState,
  level: Level,
  column: number,
  kind: PersonKind = 'officeWorker',
) {
  return addPerson(state, { kind, homeUnit: 0, level, column });
}

/** Starts a trip for the person and reports whether a route exists. */
function sendTo(state: TowerState, personId: number, to: TrekPlace): boolean {
  return startTrek(contextOf(state), slotOfPerson(state.people, personId), to);
}

function view(state: TowerState, personId: number) {
  const pool = state.people;
  const slot = slotOfPerson(pool, personId);
  return {
    level: pool.level[slot] as number,
    column: pool.column[slot] as number,
    phase: trekPhaseAt(pool, slot),
    dueStep: pool.dueStep[slot] as number,
  };
}

function runSteps(state: TowerState, steps: number): TowerState {
  return engine.step(state, [], steps).state;
}

describe('walking', () => {
  it('moves one column per step and arrives on the exact step', () => {
    const state = buildTestTower({ floors: 2 });
    const id = addWalker(state, 1, 10);
    expect(sendTo(state, id, { level: 1, column: 40 })).toBe(true);

    const midway = runSteps(state, 12);
    expect(view(midway, id)).toMatchObject({ column: 22, phase: 'walkingToDestination' });

    const arrived = runSteps(state, 30);
    expect(view(arrived, id)).toMatchObject({ column: 40, phase: 'idle', dueStep: 30 });
  });

  it('walks left as well as right', () => {
    const state = buildTestTower({ floors: 2 });
    const id = addWalker(state, 1, 60);
    sendTo(state, id, { level: 1, column: 55 });
    expect(view(runSteps(state, 5), id)).toMatchObject({ column: 55, dueStep: 5 });
  });

  it('finishes at once for someone already at the destination', () => {
    const state = buildTestTower({ floors: 2 });
    const id = addWalker(state, 1, 10);
    expect(sendTo(state, id, { level: 1, column: 10 })).toBe(true);
    expect(view(state, id)).toMatchObject({ phase: 'idle', dueStep: state.step });
  });
});

describe('stairs and escalators', () => {
  it('walks to the flight, climbs flight by flight and walks to the destination', () => {
    const state = buildTestTower({
      floors: 4,
      flights: [{ type: 'stairs', from: 1, to: 3 }],
    });
    const id = addWalker(state, 1, 10);
    expect(sendTo(state, id, { level: 3, column: 50 })).toBe(true);

    const atFlight = runSteps(state, 14);
    expect(view(atFlight, id)).toMatchObject({ column: FLIGHT_COLUMN, phase: 'onStairs' });

    const afterFirst = runSteps(state, 14 + STAIR_FLIGHT_STEPS);
    expect(view(afterFirst, id)).toMatchObject({ level: 2, phase: 'onStairs' });

    const walkingOn = runSteps(state, 14 + 2 * STAIR_FLIGHT_STEPS + 1);
    expect(view(walkingOn, id)).toMatchObject({ level: 3, column: FLIGHT_COLUMN + 1 });

    const arrivalStep = 14 + 2 * STAIR_FLIGHT_STEPS + 26;
    expect(view(runSteps(state, arrivalStep), id)).toMatchObject({
      level: 3,
      column: 50,
      phase: 'idle',
      dueStep: arrivalStep,
    });
  });

  it('keeps the last horizontal facing on the stairs and after arriving', () => {
    const state = buildTestTower({
      floors: 4,
      flights: [{ type: 'stairs', from: 1, to: 3 }],
    });
    const id = addWalker(state, 1, 90);
    const facing = (tower: TowerState) => tower.people.facing[slotOfPerson(tower.people, id)];
    expect(facing(state)).toBe(0);
    sendTo(state, id, { level: 3, column: FLIGHT_COLUMN });

    const walking = runSteps(state, 5);
    expect(facing(walking)).toBe(1);
    const onStairs = runSteps(state, 90 - FLIGHT_COLUMN + 2);
    expect(view(onStairs, id).phase).toBe('onStairs');
    expect(facing(onStairs)).toBe(1);
    const arrived = runSteps(state, 90 - FLIGHT_COLUMN + 2 * STAIR_FLIGHT_STEPS + 5);
    expect(view(arrived, id).phase).toBe('idle');
    expect(facing(arrived)).toBe(1);
  });

  it('rides an escalator flight in six steps', () => {
    const state = buildTestTower({
      floors: 2,
      flights: [{ type: 'escalator', from: 1, to: 2 }],
    });
    const id = addWalker(state, 1, FLIGHT_COLUMN);
    sendTo(state, id, { level: 2, column: FLIGHT_COLUMN });

    expect(view(runSteps(state, ESCALATOR_FLIGHT_STEPS - 1), id)).toMatchObject({
      level: 1,
      phase: 'onEscalator',
    });
    expect(view(runSteps(state, ESCALATOR_FLIGHT_STEPS), id)).toMatchObject({
      level: 2,
      phase: 'idle',
      dueStep: ESCALATOR_FLIGHT_STEPS,
    });
  });

  it('climbs 3 floors on stairs and finds no route for a fourth', () => {
    const state = buildTestTower({ floors: 5, flights: [{ type: 'stairs', from: 1, to: 5 }] });
    const id = addWalker(state, 1, 10);
    expect(sendTo(state, id, { level: 4, column: 10 })).toBe(true);
    expect(sendTo(state, id, { level: 5, column: 10 })).toBe(false);
    expect(view(state, id).phase).toBe('idle');
  });

  it('climbs 7 floors on escalators and finds no route for an eighth', () => {
    const state = buildTestTower({
      floors: 9,
      flights: [{ type: 'escalator', from: 1, to: 9 }],
    });
    const id = addWalker(state, 1, 10);
    expect(sendTo(state, id, { level: 8, column: 10 })).toBe(true);
    expect(sendTo(state, id, { level: 9, column: 10 })).toBe(false);
  });

  it('keeps the budget across flights of one trip', () => {
    const state = buildTestTower({
      floors: 8,
      flights: [
        { type: 'escalator', from: 1, to: 6 },
        { type: 'stairs', from: 6, to: 8 },
      ],
    });
    const id = addWalker(state, 1, FLIGHT_COLUMN);
    expect(sendTo(state, id, { level: 8, column: FLIGHT_COLUMN })).toBe(true);
    const total = 5 * ESCALATOR_FLIGHT_STEPS + 2 * STAIR_FLIGHT_STEPS;
    expect(view(runSteps(state, total), id)).toMatchObject({ level: 8, phase: 'idle' });
  });
});

describe('elevator queues', () => {
  const shaft: PlannedShaft = { type: 'standard', x: 60, bottom: 1, top: 4 };
  const shaftColumn = 62;

  function queueOf(state: TowerState, level: Level, direction: 'up' | 'down') {
    const built = Object.values(state.shafts)[0] as Shaft;
    return built.queues[String(level)]?.[direction] ?? [];
  }

  it('walks to the shaft and joins the queue for the direction of the ride', () => {
    const state = buildTestTower({ floors: 4, shafts: [shaft] });
    const id = addWalker(state, 1, 10);
    expect(sendTo(state, id, { level: 3, column: 30 })).toBe(true);

    const waiting = runSteps(state, shaftColumn - 10);
    expect(view(waiting, id)).toMatchObject({ column: shaftColumn, phase: 'queued' });
    expect(queueOf(waiting, 1, 'up')).toEqual([
      { person: personEntityId(id), destination: 3, joinedStep: shaftColumn - 10 },
    ]);
    expect(view(runSteps(waiting, 500), id).phase).toBe('queued');
  });

  it('queues for the down direction when the destination is below', () => {
    const state = buildTestTower({ floors: 4, shafts: [shaft] });
    const id = addWalker(state, 3, 62);
    sendTo(state, id, { level: 1, column: 62 });
    expect(view(state, id).phase).toBe('queued');
    expect(queueOf(state, 3, 'down')).toHaveLength(1);
  });

  it('waits beside a full queue and joins when there is room', () => {
    const state = buildTestTower({ floors: 4, shafts: [shaft] });
    const built = Object.values(state.shafts)[0] as Shaft;
    const crowd = Array.from({ length: ELEVATOR_QUEUE_CAPACITY }, (_, index) => ({
      person: `p${1000 + index}`,
      destination: 4 as Level,
      joinedStep: 0,
    }));
    built.queues['1'] = { up: crowd, down: [] };
    const id = addWalker(state, 1, shaftColumn);
    sendTo(state, id, { level: 3, column: 30 });
    expect(view(state, id).phase).toBe('waitingBesideQueue');

    const stillWaiting = runSteps(state, FULL_QUEUE_RECHECK_STEPS);
    expect(view(stillWaiting, id).phase).toBe('waitingBesideQueue');

    const room = structuredClone(stillWaiting);
    (Object.values(room.shafts)[0] as Shaft).queues['1']?.up.shift();
    const joined = runSteps(room, FULL_QUEUE_RECHECK_STEPS);
    expect(view(joined, id).phase).toBe('queued');
    expect(queueOf(joined, 1, 'up')).toHaveLength(ELEVATOR_QUEUE_CAPACITY);
  });

  it('leaves the queue when the trip is cancelled', () => {
    const state = buildTestTower({ floors: 4, shafts: [shaft] });
    const id = addWalker(state, 1, shaftColumn);
    sendTo(state, id, { level: 3, column: 30 });
    cancelTrek(contextOf(state), slotOfPerson(state.people, id));
    expect(queueOf(state, 1, 'up')).toEqual([]);
    expect(view(state, id)).toMatchObject({ phase: 'idle', dueStep: NOTHING_DUE });
  });

  it('sends maids on stairs only', () => {
    const state = buildTestTower({
      floors: 3,
      shafts: [{ ...shaft, top: 3 }],
      flights: [{ type: 'stairs', from: 1, to: 3 }],
    });
    const id = addWalker(state, 1, 10, 'maid');
    sendTo(state, id, { level: 3, column: 10 });
    expect(view(state, id).phase).toBe('walkingToStairs');
  });
});

describe('determinism', () => {
  function crowdedRun(): TowerState {
    const state = buildTestTower({
      floors: 6,
      flights: [
        { type: 'stairs', from: 1, to: 3 },
        { type: 'escalator', from: 3, to: 6 },
      ],
      shafts: [{ type: 'standard', x: 60, bottom: 1, top: 6 }],
    });
    for (let index = 0; index < 60; index++) {
      const id = addWalker(state, 1, (index * 7) % 90);
      sendTo(state, id, { level: 2 + (index % 5), column: (index * 13) % 90 });
    }
    return runSteps(state, 400);
  }

  it('gives the same state for the same tower and trips', () => {
    expect(hashState(crowdedRun())).toBe(hashState(crowdedRun()));
  });
});

describe('crowd used by bench:trek', () => {
  it('starts every walker on a trip and moves them when the trek system runs', () => {
    const state = trekCrowd(50);
    const context = contextOf(state);
    const before = Array.from(state.people.column.slice(0, 50));
    expect(Array.from({ length: 50 }, (_, slot) => isOnTrek(state.people, slot))).not.toContain(
      false,
    );
    context.state.step += 1;
    createTrekSystem()(context);
    expect(Array.from(state.people.column.slice(0, 50))).not.toEqual(before);
  });
});

describe('broken legs', () => {
  const shaft: PlannedShaft = { type: 'standard', x: 60, bottom: 1, top: 3 };
  const shaftColumn = 62;

  function stairsAt(state: TowerState, level: Level): string {
    const found = Object.values(state.transports).find(
      (flight) => flight.level === level && flight.type === 'stairs',
    );
    if (!found) throw new Error(`No stairs at level ${level}`);
    return found.id;
  }

  function eventsOf(state: TowerState, steps: number, type: string) {
    const run = engine.step(state, [], steps);
    return run.events.filter((event) => event.type === type);
  }

  it('re-plans when the stairs being walked to are demolished and takes the other stairs', () => {
    const state = buildTestTower({ floors: 2, flights: [{ type: 'stairs', from: 1, to: 2 }] });
    addFlight(state, 'stairs', 60, 1);
    const id = addWalker(state, 1, 10);
    sendTo(state, id, { level: 2, column: 30 });
    const walking = runSteps(state, 3);
    expect(view(walking, id).phase).toBe('walkingToStairs');

    Reflect.deleteProperty(walking.transports, stairsAt(walking, 1));
    const rerouted = runSteps(walking, 1);
    expect(view(rerouted, id).phase).toBe('walkingToStairs');
    const arrived = runSteps(rerouted, 200);
    expect(view(arrived, id)).toMatchObject({ level: 2, column: 30, phase: 'idle' });
  });

  it('puts a person on a demolished flight on its other level and re-plans there', () => {
    const state = buildTestTower({ floors: 3, flights: [{ type: 'stairs', from: 1, to: 3 }] });
    const id = addWalker(state, 1, FLIGHT_COLUMN);
    sendTo(state, id, { level: 3, column: 30 });
    expect(view(state, id).phase).toBe('onStairs');

    Reflect.deleteProperty(state.transports, stairsAt(state, 1));
    const after = runSteps(state, 1);
    expect(view(after, id)).toMatchObject({ level: 2, phase: 'onStairs' });
    const arrived = runSteps(after, 100);
    expect(view(arrived, id)).toMatchObject({ level: 3, column: 30, phase: 'idle' });
  });

  it('waits and searches again after the retry delay when no route is left', () => {
    const state = buildTestTower({ floors: 2, flights: [{ type: 'stairs', from: 1, to: 2 }] });
    const id = addWalker(state, 1, 10);
    sendTo(state, id, { level: 2, column: 30 });
    Reflect.deleteProperty(state.transports, stairsAt(state, 1));

    const failed = eventsOf(state, 1, 'routeSearchFailed');
    expect(failed).toHaveLength(1);
    const waiting = runSteps(state, 1);
    expect(view(waiting, id).phase).toBe('noRoute');

    const retried = eventsOf(waiting, ROUTE_RETRY_STEPS, 'routeSearchFailed');
    expect(retried).toHaveLength(1);

    addFlight(waiting, 'stairs', FLIGHT_X, 1);
    const found = runSteps(waiting, ROUTE_RETRY_STEPS + 100);
    expect(view(found, id)).toMatchObject({ level: 2, column: 30, phase: 'idle' });
  });

  it('takes people out of the queue when the shaft is demolished', () => {
    const state = buildTestTower({
      floors: 3,
      flights: [{ type: 'stairs', from: 1, to: 3 }],
      shafts: [shaft],
    });
    const id = addWalker(state, 1, shaftColumn);
    sendTo(state, id, { level: 3, column: shaftColumn });
    expect(view(state, id).phase).toBe('queued');

    const built = Object.values(state.shafts)[0] as Shaft;
    Reflect.deleteProperty(state.shafts, built.id);
    const after = runSteps(state, 1);
    expect(view(after, id).phase).not.toBe('queued');
    const arrived = runSteps(after, 400);
    expect(view(arrived, id)).toMatchObject({ level: 3, column: shaftColumn, phase: 'idle' });
  });

  it('re-plans when the stop being queued at is disabled', () => {
    const state = buildTestTower({
      floors: 3,
      flights: [{ type: 'stairs', from: 1, to: 3 }],
      shafts: [shaft],
    });
    const id = addWalker(state, 1, shaftColumn);
    sendTo(state, id, { level: 3, column: shaftColumn });
    const built = Object.values(state.shafts)[0] as Shaft;
    built.stops = built.stops.filter((level) => level !== 1);

    const after = runSteps(state, 1);
    expect(view(after, id).phase).not.toBe('queued');
    expect(Object.values(after.shafts)[0]?.queues['1']?.up ?? []).toHaveLength(0);
  });
});
