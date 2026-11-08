import { UNIT_CATALOG, UNIT_TYPES, type UnitType, type UnitView } from '@tower-magnate/shared';
import type { ClientStore } from '../model/clientStore';
import type { GameState } from '../model/gameState';
import type { OverlayId } from './overlayColors';
import { fullWidthTestTower } from './structureSource';
import type { StructureInput } from './structureRows';
import { skyTimeAt, stepAtHour, timeOfDayAt, type SkyTime } from './timeOfDay';
import type { UnitsInput } from './unitLayer';
import { isPlacedUnit, type TransportSource } from './unitPlan';

export function unitsOf(state: GameState, overlay: OverlayId = 'normal'): UnitsInput {
  return {
    overlay: { id: overlay, data: state.overlays },
    units: state.units.values(),
    transports: state.transports.values(),
    time: timeOfDayAt(state.step),
  };
}

/**
 * Feeds `show` from the store on every frame that changes a unit, a transport
 * or the time of day, so a variant change in a delta is drawn on the next frame.
 */
export function bindUnits(
  store: ClientStore,
  overlay: OverlayId,
  show: (input: UnitsInput) => void,
): () => void {
  return store.select(
    (state) => ({
      overlays: state.overlays,
      units: state.units,
      transports: state.transports,
      time: timeOfDayAt(state.step),
    }),
    (selected) =>
      show({
        units: selected.units.values(),
        transports: selected.transports.values(),
        time: selected.time,
        overlay: { id: overlay, data: selected.overlays },
      }),
  );
}

/** Feeds `show` the sky time, and only when it changes. */
export function bindSky(store: ClientStore, show: (time: SkyTime) => void): () => void {
  return store.select((state) => skyTimeAt(state.step), show);
}

const DEBUG_ROW_SPACING = 5;
const DEBUG_FIRST_LEVEL = 4;
const DEBUG_RUINS_FROM = 60;
const DEBUG_RUINS_WIDTH = 6;

/** Every placed unit type twice, empty on the first row and occupied on the second, plus stairs and an escalator. */
export function debugUnits(
  hour: number,
  overlay: OverlayId = 'normal',
): UnitsInput & {
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
  units.push(...variantUnits());
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
    overlay: { id: overlay, data: { evaluation: {}, price: {}, hotel: {} } },
  };
}

export const DEBUG_VARIANT_LEVEL = DEBUG_FIRST_LEVEL + 3 * DEBUG_ROW_SPACING;

/** Dirty and infested hotel rooms and a disconnected parking space, left of the debug ruins. */
function variantUnits(): UnitView[] {
  const variants: [UnitType, UnitView['variant']][] = [
    ['single-room', 'dirty'],
    ['single-room', 'infested'],
    ['double-room', 'dirty'],
    ['double-room', 'infested'],
    ['suite', 'dirty'],
    ['suite', 'infested'],
    ['parking-space', 'disconnected'],
  ];
  let x = 0;
  return variants.map(([type, variant]) => {
    const unit: UnitView = {
      id: `debug-${type}-${variant}`,
      type,
      x,
      level: DEBUG_VARIANT_LEVEL,
      name: null,
      price: 'normal',
      occupied: false,
      variant,
    };
    x += UNIT_CATALOG[type].width;
    return unit;
  });
}

/** Floors the debug tower needs under its units. */
export const DEBUG_UNIT_FLOORS = DEBUG_VARIANT_LEVEL + 2;

/** The debug tower with a run of ruins on the variant level, right of its units. */
export function debugStructure(): StructureInput {
  const tower = fullWidthTestTower(DEBUG_UNIT_FLOORS);
  const row = [...(tower.structure.get(DEBUG_VARIANT_LEVEL) ?? '')];
  row.fill('r', DEBUG_RUINS_FROM, DEBUG_RUINS_FROM + DEBUG_RUINS_WIDTH);
  const structure = new Map(tower.structure).set(DEBUG_VARIANT_LEVEL, row.join(''));
  return { ...tower, structure };
}

/** Reads `?testUnits=H` (hour 0 to 23) so a dev build can draw every unit empty and occupied at that hour. */
export function testUnitsFromQuery(search: string): number | null {
  const raw = new URLSearchParams(search).get('testUnits');
  if (raw === null) {
    return null;
  }
  const hour = Number(raw);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : null;
}
