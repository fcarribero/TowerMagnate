import type { Delta, PersonView, Snapshot, UnitView } from '@tower-magnate/shared';
import { car, office, snapshot as startSnapshot, walker } from './protocolFixtures';

const STEPS_PER_GAME_MINUTE = 6;
const HEARTBEAT_STEPS = 10;

export interface RecordedSession {
  first: Snapshot;
  deltas: Delta[];
  last: Snapshot;
}

const customer: PersonView = { ...walker, id: 'p2', kind: 'customer', x: 40, level: 1 };
const fastFood: UnitView = { ...office, id: 'u30', type: 'fast-food', x: 30, level: 1 };

/** The tower as the server would see it after `elapsed` steps of a small scripted session. */
function towerAt(elapsed: number): Snapshot {
  const carMoving = elapsed < 20 || elapsed >= 35;
  const carPosition = carMoving ? Math.min(1 + elapsed * 0.1, 5) : 3;
  const people = [{ ...walker, x: walker.x + Math.floor(elapsed / 3) }];
  if (elapsed >= 10 && elapsed < 40) {
    people.push(customer);
  }
  const units = elapsed >= 15 && elapsed < 50 ? [office, fastFood] : [office];
  const levels: Snapshot['grid']['levels'] = { ...startSnapshot.grid.levels };
  if (elapsed >= 25) {
    levels['2'] = { structure: 'f'.repeat(375) };
  }
  return {
    ...startSnapshot,
    step: startSnapshot.step + elapsed,
    money: startSnapshot.money - Math.floor(elapsed / 12) * 500,
    population: people.length,
    grid: { ...startSnapshot.grid, levels },
    units,
    cars: [{ ...car, position: carPosition }],
    people,
  };
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** What the server sends between two tower states, or null when nothing visible changed. */
function deltaBetween(before: Snapshot, after: Snapshot, heartbeatDue: boolean): Delta | null {
  const delta: Delta = { step: after.step, cars: after.cars, people: after.people };
  let changed = !sameJson(before.cars, after.cars) || !sameJson(before.people, after.people);
  if (before.money !== after.money) {
    delta.money = after.money;
    changed = true;
  }
  if (before.population !== after.population) {
    delta.population = after.population;
    changed = true;
  }
  const changedRows = Object.entries(after.grid.levels)
    .filter(([level, row]) => before.grid.levels[level]?.structure !== row.structure)
    .map(([level, row]) => ({ level: Number(level), structure: row.structure }));
  if (changedRows.length > 0) {
    delta.structure = changedRows;
    changed = true;
  }
  const beforeIds = new Set(before.units.map((unit) => unit.id));
  const afterIds = new Set(after.units.map((unit) => unit.id));
  const added = after.units.filter((unit) => !beforeIds.has(unit.id));
  const removed = [...beforeIds].filter((id) => !afterIds.has(id));
  if (added.length > 0) {
    delta.unitsUpserted = added;
    changed = true;
  }
  if (removed.length > 0) {
    delta.unitsRemoved = removed;
    changed = true;
  }
  const gone = before.people
    .filter((person) => !after.people.some((other) => other.id === person.id))
    .map((person) => person.id);
  if (gone.length > 0) {
    delta.peopleGone = gone;
  }
  return changed || heartbeatDue ? delta : null;
}

/** A snapshot, the deltas the server would send for `gameMinutes`, and the snapshot at the end. */
export function recordSession(gameMinutes: number): RecordedSession {
  const totalSteps = gameMinutes * STEPS_PER_GAME_MINUTE;
  const deltas: Delta[] = [];
  let sent = towerAt(0);
  for (let elapsed = 1; elapsed <= totalSteps; elapsed += 1) {
    const next = towerAt(elapsed);
    const isLastStep = elapsed === totalSteps;
    const heartbeatDue = isLastStep || next.step - sent.step >= HEARTBEAT_STEPS;
    const delta = deltaBetween(sent, next, heartbeatDue);
    if (delta !== null) {
      deltas.push(delta);
      sent = next;
    }
  }
  return { first: towerAt(0), deltas, last: towerAt(totalSteps) };
}
