import type { TowerState } from '@tower-magnate/shared';
import { slotOfPerson } from './people';

/** Whether the people of a unit who ask for parking all have a space. */
export type UnitParking = 'has' | 'missing';

/**
 * The parking each unit asks for, by unit number (people spec 17): from 3 stars, a unit with a
 * parking holder has it when every holder has a space and misses it when any holder has none.
 * Units with no holder, and every unit under 3 stars, are left out.
 */
export function parkingByUnit(state: TowerState): Map<number, UnitParking> {
  const byUnit = new Map<number, UnitParking>();
  if (state.stars < 3) return byUnit;
  for (const [person, space] of Object.entries(state.parking.spaces)) {
    const slot = slotOfPerson(state.people, Number(person));
    if (slot < 0) continue;
    const unit = state.people.homeUnit[slot] as number;
    if (unit <= 0) continue;
    if (space === 0) byUnit.set(unit, 'missing');
    else if (!byUnit.has(unit)) byUnit.set(unit, 'has');
  }
  return byUnit;
}
