import {
  ELEVATOR_QUEUE_CAPACITY,
  ESCALATOR_FLIGHT_STEPS,
  FULL_QUEUE_RECHECK_STEPS,
  FULL_QUEUE_STAY_RECHECKS,
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
  alightRider,
  boardRider,
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

describe('lines for the elevator', () => {
  const shafts: PlannedShaft[] = [{ type: 'standard', x: 60, bottom: 1, top: 4 }];

  it('makes people queued for the same ride stand in a line away from the shaft', () => {
    const state = buildTestTower({ floors: 4, shafts });
    const ids = [30, 31, 32].map((column) => addWalker(state, 1, column));
    for (const id of ids) sendTo(state, id, { level: 3, column: 40 });
    const after = runSteps(state, 80);
    const columns = ids.map((id) => view(after, id));
    expect(columns.every((person) => person.phase === 'queued')).toBe(true);
    const sorted = columns.map((person) => person.column).sort((a, b) => a - b);
    expect(new Set(sorted).size).toBe(3);
    expect(Math.max(...sorted) - Math.min(...sorted)).toBe(2);
  });

  it('puts the up line on the right of the shaft and the down line on the left', () => {
    const state = buildTestTower({ floors: 4, shafts });
    const up = addWalker(state, 2, 62);
    const down = addWalker(state, 3, 62);
    sendTo(state, up, { level: 3, column: 40 });
    sendTo(state, down, { level: 2, column: 40 });
    const first = view(runSteps(state, 40), up).column;
    expect(first).toBeGreaterThanOrEqual(view(runSteps(state, 40), down).column);
  });
});

describe('walking in a crowd', () => {
  function columnOf(state: TowerState, id: number): number {
    return view(state, id).column;
  }

  it('lets two people walking in opposite directions cross', () => {
    const state = buildTestTower({ floors: 2 });
    const east = addWalker(state, 1, 10);
    const west = addWalker(state, 1, 14);
    sendTo(state, east, { level: 1, column: 14 });
    sendTo(state, west, { level: 1, column: 10 });
    const after = runSteps(state, 4);
    expect(columnOf(after, east)).toBe(14);
    expect(columnOf(after, west)).toBe(10);
  });

  it('keeps a walker behind the one ahead going the same way and never shares a cell', () => {
    const state = buildTestTower({ floors: 2 });
    const front = addWalker(state, 1, 11);
    const back = addWalker(state, 1, 10);
    sendTo(state, front, { level: 1, column: 30 });
    sendTo(state, back, { level: 1, column: 30 });
    let now = state;
    for (let step = 0; step < 8; step++) {
      now = runSteps(now, 1);
      expect(columnOf(now, back)).toBeLessThan(columnOf(now, front));
    }
    expect(columnOf(now, front)).toBe(19);
    expect(columnOf(now, back)).toBe(18);
  });

  it('makes a walker wait while the one ahead is stopped by a one-cell gap', () => {
    const state = buildTestTower({ floors: 2 });
    const front = addWalker(state, 1, 10);
    const back = addWalker(state, 1, 10);
    sendTo(state, front, { level: 1, column: 20 });
    sendTo(state, back, { level: 1, column: 20 });
    const after = runSteps(state, 1);
    expect(columnOf(after, front)).toBe(11);
    expect(columnOf(after, back)).toBe(10);
  });
});

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

  it('lets people beside a full queue join one by one while there is room', () => {
    const state = buildTestTower({ floors: 4, shafts: [shaft] });
    const built = Object.values(state.shafts)[0] as Shaft;
    built.queues['1'] = {
      up: Array.from({ length: ELEVATOR_QUEUE_CAPACITY }, (_, index) => ({
        person: `p${1000 + index}`,
        destination: 4 as Level,
        joinedStep: 0,
      })),
      down: [],
    };
    const waiters = [1, 2, 3].map(() => addWalker(state, 1, shaftColumn));
    for (const id of waiters) sendTo(state, id, { level: 3, column: 30 });
    expect(waiters.map((id) => view(state, id).phase)).toEqual(Array(3).fill('waitingBesideQueue'));

    const room = structuredClone(state);
    (Object.values(room.shafts)[0] as Shaft).queues['1']?.up.splice(0, 2);
    const after = runSteps(room, FULL_QUEUE_RECHECK_STEPS);
    expect(waiters.map((id) => view(after, id).phase)).toEqual([
      'queued',
      'queued',
      'waitingBesideQueue',
    ]);
    expect(queueOf(after, 1, 'up')).toHaveLength(ELEVATOR_QUEUE_CAPACITY);
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

describe('full queue recheck rule (routing 8.3)', () => {
  const shafts: PlannedShaft[] = [
    { type: 'standard', x: 60, bottom: 1, top: 4 },
    { type: 'standard', x: 70, bottom: 1, top: 4 },
    { type: 'standard', x: 80, bottom: 1, top: 4 },
  ];
  const [first, second, third] = [62, 72, 82];
  const arrivalStep = 7;
  const thirdRecheckStep = arrivalStep + FULL_QUEUE_STAY_RECHECKS * FULL_QUEUE_RECHECK_STEPS;

  function setQueue(state: TowerState, shaftIndex: number, length: number): void {
    const built = Object.values(state.shafts)[shaftIndex] as Shaft;
    const up = Array.from({ length }, (_, index) => ({
      person: `p${5000 + shaftIndex * 100 + index}`,
      destination: 4 as Level,
      joinedStep: 0,
    }));
    built.queues['1'] = { up, down: [] };
  }

  /** Only the shafts at these indexes have a full queue. */
  function fillOnly(state: TowerState, ...full: number[]): void {
    for (const index of Object.keys(state.shafts).keys()) {
      setQueue(state, index, full.includes(index) ? ELEVATOR_QUEUE_CAPACITY : 0);
    }
  }

  /** The person plans for the first shaft, whose queue then fills up while they walk to it. */
  function waiterWalkingToFirstShaft(setup: Partial<Setup> = {}) {
    const state = buildTestTower({ floors: 4, shafts, ...setup });
    const id = addWalker(state, 1, first - arrivalStep);
    sendTo(state, id, { level: 3, column: 30 });
    fillOnly(state, 0);
    return { state, id };
  }

  function pool(state: TowerState, id: number) {
    const people = state.people;
    const slot = slotOfPerson(people, id);
    return {
      switches: people.tripSwitches[slot] as number,
      leftShafts: people.leftShafts[slot] as number,
      headingTo: people.legColumn[slot] as number,
    };
  }

  function runUntilHeadingTo(state: TowerState, id: number, column: number, limit = 80) {
    let now = state;
    for (let count = 0; count < limit && pool(now, id).headingTo !== column; count++) {
      now = runSteps(now, 1);
    }
    return now;
  }

  it('only looks at its own queue for the first two rechecks', () => {
    const { state, id } = waiterWalkingToFirstShaft();
    const beforeThird = runSteps(state, thirdRecheckStep - 1);
    expect(view(beforeThird, id)).toMatchObject({ column: first, phase: 'waitingBesideQueue' });
    expect(pool(beforeThird, id)).toMatchObject({ switches: 0, headingTo: first });
  });

  it('switches at the third recheck to a ride that costs 500 less than waiting', () => {
    const { state, id } = waiterWalkingToFirstShaft();
    const switched = runSteps(state, thirdRecheckStep);
    expect(view(switched, id).phase).toBe('walkingToShaft');
    expect(pool(switched, id)).toMatchObject({ switches: 1, headingTo: second });
  });

  it('joins at once when the queue has room at the first recheck', () => {
    const { state, id } = waiterWalkingToFirstShaft();
    const arrived = runSteps(state, arrivalStep);
    setQueue(arrived, 0, ELEVATOR_QUEUE_CAPACITY - 1);
    const joined = runSteps(arrived, FULL_QUEUE_RECHECK_STEPS);
    expect(view(joined, id).phase).toBe('queued');
    expect(pool(joined, id).switches).toBe(0);
  });

  it('keeps waiting when the other way costs less than 500 under waiting', () => {
    const { state, id } = waiterWalkingToFirstShaft({
      shafts: [shafts[0] as PlannedShaft, { type: 'standard', x: 70, bottom: 1, top: 2 }],
      flights: [{ type: 'stairs', from: 2, to: 3 }],
    });
    const waited = runSteps(state, thirdRecheckStep + 5 * FULL_QUEUE_RECHECK_STEPS);
    expect(view(waited, id)).toMatchObject({ column: first, phase: 'waitingBesideQueue' });
    expect(pool(waited, id).switches).toBe(0);
  });

  it('never goes back to a shaft it left, and stops switching after two', () => {
    const { state, id } = waiterWalkingToFirstShaft();
    let now = runUntilHeadingTo(state, id, second);
    fillOnly(now, 1);
    now = runUntilHeadingTo(now, id, third);
    expect(pool(now, id)).toMatchObject({ switches: 2, headingTo: third });

    fillOnly(now, 2);
    const waited = runSteps(now, 20 * FULL_QUEUE_RECHECK_STEPS);
    expect(view(waited, id)).toMatchObject({ column: third, phase: 'waitingBesideQueue' });
    expect(pool(waited, id).switches).toBe(2);

    setQueue(waited, 2, ELEVATOR_QUEUE_CAPACITY - 1);
    expect(view(runSteps(waited, FULL_QUEUE_RECHECK_STEPS), id).phase).toBe('queued');
  });

  it('keeps the switch count and the left shafts that still run when the trip re-plans', () => {
    const { state, id } = waiterWalkingToFirstShaft();
    const walking = runUntilHeadingTo(state, id, second);
    fillOnly(walking, 1);
    const arrived = runSteps(walking, second - first);
    expect(view(arrived, id).phase).toBe('waitingBesideQueue');
    const leftBefore = pool(arrived, id).leftShafts;
    expect(leftBefore).not.toBe(0);

    const waitedAt = Object.values(arrived.shafts)[1] as Shaft;
    Reflect.deleteProperty(arrived.shafts, waitedAt.id);
    const replanned = runSteps(arrived, 1);
    expect(pool(replanned, id)).toMatchObject({ switches: 1, leftShafts: leftBefore });
  });

  it('drops a left shaft that was demolished when the trip re-plans', () => {
    const { state, id } = waiterWalkingToFirstShaft();
    const walking = runUntilHeadingTo(state, id, second);
    fillOnly(walking, 1);
    const arrived = runSteps(walking, second - first);
    expect(pool(arrived, id).leftShafts).not.toBe(0);

    const [leftShaft, waitedAt] = Object.values(arrived.shafts) as Shaft[];
    Reflect.deleteProperty(arrived.shafts, (leftShaft as Shaft).id);
    Reflect.deleteProperty(arrived.shafts, (waitedAt as Shaft).id);
    const replanned = runSteps(arrived, 1);
    expect(pool(replanned, id)).toMatchObject({ switches: 1, leftShafts: 0 });
  });

  it('does not head back to a shaft it left after a re-plan', () => {
    const { state, id } = waiterWalkingToFirstShaft();
    const walking = runUntilHeadingTo(state, id, second);
    fillOnly(walking, 1);
    const arrived = runSteps(walking, second - first);
    expect(pool(arrived, id).leftShafts).not.toBe(0);

    const waitedAt = Object.values(arrived.shafts)[1] as Shaft;
    Reflect.deleteProperty(arrived.shafts, waitedAt.id);
    fillOnly(arrived);
    const replanned = runSteps(arrived, 1);
    expect(pool(replanned, id).headingTo).not.toBe(first);
  });

  it('counts switches again in a second trip of the same person', () => {
    const { state, id } = waiterWalkingToFirstShaft();
    const walking = runUntilHeadingTo(state, id, second);
    expect(pool(walking, id).switches).toBe(1);

    fillOnly(walking);
    let now = walking;
    for (let count = 0; count < 100 && view(now, id).phase !== 'queued'; count++) {
      now = runSteps(now, 1);
    }
    boardRider(contextOf(now), personEntityId(id));
    alightRider(contextOf(now), personEntityId(id), 3);
    now = runSteps(now, 80);
    expect(view(now, id)).toMatchObject({ level: 3, column: 30 });
    expect(pool(now, id)).toMatchObject({ switches: 0, leftShafts: 0 });

    expect(sendTo(now, id, { level: 1, column: 30 })).toBe(true);
    const firstShaft = Object.values(now.shafts)[0] as Shaft;
    const crowd = Array.from({ length: ELEVATOR_QUEUE_CAPACITY }, (_, index) => ({
      person: `p${7000 + index}`,
      destination: 1 as Level,
      joinedStep: 0,
    }));
    firstShaft.queues['3'] = { up: [], down: crowd };
    const again = runUntilHeadingTo(now, id, second, 120);
    expect(pool(again, id)).toMatchObject({ switches: 1, headingTo: second });
  });

  it('starts every trip with no switches and no left shafts', () => {
    const { state, id } = waiterWalkingToFirstShaft();
    const walking = runUntilHeadingTo(state, id, second);
    expect(pool(walking, id).switches).toBe(1);
    cancelTrek(contextOf(walking), slotOfPerson(walking.people, id));
    expect(pool(walking, id)).toMatchObject({ switches: 0, leftShafts: 0 });
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
