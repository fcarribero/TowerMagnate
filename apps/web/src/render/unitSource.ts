import { UNIT_CATALOG, UNIT_TYPES, type UnitView } from '@tower-magnate/shared';
import type { ClientStore } from '../model/clientStore';
import type { GameState } from '../model/gameState';
import { stepAtHour, timeOfDayAt } from './timeOfDay';
import type { UnitsInput } from './unitLayer';
import { isPlacedUnit, type TransportSource } from './unitPlan';

export function unitsOf(state: GameState): UnitsInput {
  return {
    units: state.units.values(),
    transports: state.transports.values(),
    time: timeOfDayAt(state.step),
  };
}

/**
 * Feeds `show` from the store on every frame that changes a unit, a transport
 * or the time of day, so a variant change in a delta is drawn on the next frame.
 */
export function bindUnits(store: ClientStore, show: (input: UnitsInput) => void): () => void {
  return store.select(
    (state) => ({
      units: state.units,
      transports: state.transports,
      time: timeOfDayAt(state.step),
    }),
    (selected) =>
      show({
        units: selected.units.values(),
        transports: selected.transports.values(),
        time: selected.time,
      }),
  );
}

const DEBUG_ROW_SPACING = 5;
const DEBUG_FIRST_LEVEL = 4;

/** Every placed unit type twice, empty on the first row and occupied on the second, plus stairs and an escalator. */
export function debugUnits(hour: number): UnitsInput & {
  units: UnitView[];
  transports: TransportSource[];
} {
  const units: UnitView[] = [];
  const states = [false, true];
  states.forEach((occupied, row) => {
    let x = 0;
    for (const type of UNIT_TYPES.filter(isPlacedUnit)) {
      units.push({
        id: `debug-${type}-${row}`,
        type,
        x,
        level: DEBUG_FIRST_LEVEL + row * DEBUG_ROW_SPACING,
        name: null,
        price: 'normal',
        occupied,
        variant: occupied ? 'occupied' : 'empty',
      });
      x += UNIT_CATALOG[type].width;
    }
  });
  return {
    units,
    transports: [
      {
        id: 'debug-stairs',
        type: 'stairs',
        x: 0,
        level: DEBUG_FIRST_LEVEL + 2 * DEBUG_ROW_SPACING,
      },
      {
        id: 'debug-escalator',
        type: 'escalator',
        x: 10,
        level: DEBUG_FIRST_LEVEL + 2 * DEBUG_ROW_SPACING,
      },
    ],
    time: timeOfDayAt(stepAtHour(hour)),
  };
}

/** Floors the debug tower needs under its units. */
export const DEBUG_UNIT_FLOORS = DEBUG_FIRST_LEVEL + 2 * DEBUG_ROW_SPACING + 2;

/** Reads `?testUnits=H` (hour 0 to 23) so a dev build can draw every unit empty and occupied at that hour. */
export function testUnitsFromQuery(search: string): number | null {
  const raw = new URLSearchParams(search).get('testUnits');
  if (raw === null) {
    return null;
  }
  const hour = Number(raw);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : null;
}
