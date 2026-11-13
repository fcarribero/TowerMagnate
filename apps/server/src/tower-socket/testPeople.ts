import { addPerson, encodeRoutine, slotOfPerson } from '@tower-magnate/engine';
import type { TowerState } from '@tower-magnate/shared';

type NewPerson = Parameters<typeof addPerson>[1];

/** An office worker who is at the office, so the server counts them as inside the tower. */
/** Gives everyone of the unit a plan that has them at their desk. */
export function seatPeopleOfUnit(state: TowerState, unitNumber: number): void {
  state.people.homeUnit.forEach((home, slot) => {
    if (home === unitNumber) state.people.trip[slot] = atOfficeTrip();
  });
}

function atOfficeTrip(): number {
  return encodeRoutine({
    phase: 'atOffice',
    lunchHandled: false,
    entranceOnRight: false,
    venue: 0,
    medical: false,
    lunchMinute: 720,
    leaveMinute: 1020,
  });
}

export function addOfficeWorker(state: TowerState, person: Omit<NewPerson, 'kind'>): number {
  const id = addPerson(state, { ...person, kind: 'officeWorker' });
  state.people.trip[slotOfPerson(state.people, id)] = encodeRoutine({
    phase: 'atOffice',
    lunchHandled: false,
    entranceOnRight: false,
    venue: 0,
    medical: false,
    lunchMinute: 720,
    leaveMinute: 1020,
  });
  return id;
}
