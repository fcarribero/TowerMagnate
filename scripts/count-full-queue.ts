/**
 * Counts how people move between full lobby queues in the 15,000-person bench tower, from 06:00
 * to 14:00 of the first weekday with commuters. Run with `pnpm count:full-queue`. The counts are
 * the ones of TM-258, read from the person pool after each step.
 */
import { STEPS_PER_HOUR, STEPS_PER_DAY, TREK_PHASES, step } from '@tower-magnate/engine';
import { fullTower } from '@tower-magnate/engine/testing';

const WALKING_TO_SHAFT = TREK_PHASES.indexOf('walkingToShaft');
const QUEUED = TREK_PHASES.indexOf('queued');
const WAITING_BESIDE_QUEUE = TREK_PHASES.indexOf('waitingBesideQueue');
const RIDING = TREK_PHASES.indexOf('riding');
const LOBBY = 1;

const FROM = STEPS_PER_DAY + 6 * STEPS_PER_HOUR;
const STEPS = 8 * STEPS_PER_HOUR;

interface Person {
  changes: number;
  switchesInTrip: number;
  mostSwitchesInTrip: number;
  boarded: boolean;
  chosen: number[];
  wentBack: boolean;
  flipped: boolean;
}

const people = new Map<number, Person>();
function personOf(id: number): Person {
  let person = people.get(id);
  if (!person) {
    person = {
      changes: 0,
      switchesInTrip: 0,
      mostSwitchesInTrip: 0,
      boarded: false,
      chosen: [],
      wentBack: false,
      flipped: false,
    };
    people.set(id, person);
  }
  return person;
}

let state = step(fullTower(), [], FROM).state;
let rechecksThatChanged = 0;
let boardingsAtLobby = 0;
let boardings = 0;
let flipTimes = 0;
let joinsFromBeside = 0;

for (let index = 0; index < STEPS; index++) {
  const before = state.people;
  const phases = Array.from(before.trek);
  const idle = Array.from(before.trek, (phase) => phase === 0);
  state = step(state, [], 1).state;
  const pool = state.people;
  for (let slot = 0; slot < pool.id.length; slot++) {
    const was = phases[slot] as number;
    const now = pool.trek[slot] as number;
    const id = pool.id[slot] as number;
    if (idle[slot] && now !== 0) {
      const fresh = personOf(id);
      fresh.switchesInTrip = 0;
      fresh.chosen = [];
    }
    if (was === WAITING_BESIDE_QUEUE && now === WALKING_TO_SHAFT) {
      const person = personOf(id);
      rechecksThatChanged++;
      person.changes++;
      person.switchesInTrip++;
      person.mostSwitchesInTrip = Math.max(person.mostSwitchesInTrip, person.switchesInTrip);
      const via = pool.legVia[slot] as number;
      const [older, last] = [person.chosen[person.chosen.length - 2], person.chosen.at(-1)];
      if (via === older && last !== via) {
        person.flipped = true;
        flipTimes++;
      }
      if (person.chosen.includes(via)) person.wentBack = true;
      person.chosen.push(via);
    } else if (was === WAITING_BESIDE_QUEUE && now === QUEUED) {
      joinsFromBeside++;
    } else if (was === WAITING_BESIDE_QUEUE && now !== WAITING_BESIDE_QUEUE) {
      personOf(id).changes++;
    }
    if (was === QUEUED && now === RIDING) {
      boardings++;
      personOf(id).boarded = true;
      if (before.level[slot] === LOBBY) boardingsAtLobby++;
    }
    if (now === WALKING_TO_SHAFT && was !== WALKING_TO_SHAFT && was !== WAITING_BESIDE_QUEUE) {
      const person = personOf(id);
      person.chosen.push(pool.legVia[slot] as number);
    }
  }
}

const all = [...people.values()];
const count = (test: (person: Person) => boolean) => all.filter(test).length;
const stillInLobby = Array.from(state.people.trek).filter(
  (phase, slot) =>
    (phase === WALKING_TO_SHAFT || phase === QUEUED || phase === WAITING_BESIDE_QUEUE) &&
    state.people.level[slot] === LOBBY,
).length;

console.log(
  [
    `People: ${state.people.id.length}`,
    `Rechecks that changed the chosen ride: ${rechecksThatChanged}`,
    `People with at least 1 change: ${count((person) => person.changes > 0)}`,
    `Most switches by one person in one trip: ${Math.max(0, ...all.map((person) => person.mostSwitchesInTrip))}`,
    `People with 10 or more changes: ${count((person) => person.changes >= 10)}`,
    `People who went A to B and straight back to A: ${count((person) => person.flipped)} (${flipTimes} times)`,
    `People who went back to a shaft they had already chosen: ${count((person) => person.wentBack)}`,
    `People with changes who never boarded: ${count((person) => person.mostSwitchesInTrip > 0 && !person.boarded)}`,
    `Joins from beside a full queue: ${joinsFromBeside}`,
    `Boardings in the whole tower: ${boardings}`,
    `Boardings at level 1: ${boardingsAtLobby}`,
    `People still going to a shaft or queueing at level 1 at 14:00: ${stillInLobby}`,
  ].join('\n'),
);
