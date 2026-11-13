import { describe, expect, it } from 'vitest';
import { encodeGuestRoutine } from './hotel-guest-trip';
import { encodeRoutine } from './office-routine';
import { isOutsideTower } from './outside-tower';
import { addPerson } from './people';
import { encodeResidentRoutine } from './resident-routine';
import { createTower } from './state';
import { TREK_PHASES } from './trek';

function towerWith(kind: 'officeWorker' | 'resident' | 'hotelGuest', trip: number) {
  const state = createTower(1);
  addPerson(state, { kind, homeUnit: 1, level: 1, column: 0 });
  state.people.trip[0] = trip;
  return state;
}

function officeTrip(phase: Parameters<typeof encodeRoutine>[0]['phase']): number {
  return encodeRoutine({
    phase,
    lunchHandled: false,
    entranceOnRight: false,
    venue: 0,
    medical: false,
    lunchMinute: 720,
    leaveMinute: 1020,
  });
}

describe('isOutsideTower', () => {
  it('is true for an office worker waiting to come in or who gave up coming in', () => {
    expect(isOutsideTower(towerWith('officeWorker', officeTrip('waitingToArrive')).people, 0)).toBe(
      true,
    );
    expect(isOutsideTower(towerWith('officeWorker', officeTrip('givingUpArrival')).people, 0)).toBe(
      true,
    );
    expect(isOutsideTower(towerWith('officeWorker', officeTrip('atOffice')).people, 0)).toBe(false);
  });

  it('is true for an office worker with no plan: weekend, gone home or just moved in', () => {
    expect(isOutsideTower(towerWith('officeWorker', 0).people, 0)).toBe(true);
  });

  it('is false for anyone on a trek, whatever the routine says', () => {
    const state = towerWith('officeWorker', officeTrip('waitingToArrive'));
    state.people.trek[0] = TREK_PHASES.indexOf('walkingToDestination');

    expect(isOutsideTower(state.people, 0)).toBe(false);
  });

  it('is true for a resident or hotel guest who has gone out', () => {
    const resident = (phase: 'outside' | 'home') =>
      towerWith(
        'resident',
        encodeResidentRoutine({ plan: 'works', phase, venue: 0, slots: [0, 0, 0] }),
      );
    const guest = (phase: 'outside' | 'room') =>
      towerWith('hotelGuest', encodeGuestRoutine({ phase, venue: 0, slots: [0, 0, 0] }));

    expect(isOutsideTower(resident('outside').people, 0)).toBe(true);
    expect(isOutsideTower(resident('home').people, 0)).toBe(false);
    expect(isOutsideTower(guest('outside').people, 0)).toBe(true);
    expect(isOutsideTower(guest('room').people, 0)).toBe(false);
  });

  it('is false for someone with no plan today', () => {
    expect(isOutsideTower(towerWith('resident', 0).people, 0)).toBe(false);
  });
});
