import { levelAbove, type Level, type TowerState, type UnitType } from '@tower-magnate/shared';

/** C-30: the unit types a level can hold and still have an escalator end on it. */
const ESCALATOR_FLOOR_UNITS: ReadonlySet<UnitType> = new Set([
  'fast-food',
  'restaurant',
  'retail-shop',
  'cinema',
  'party-hall',
  'single-room',
]);

export function isEscalatorUnit(unitType: UnitType): boolean {
  return ESCALATOR_FLOOR_UNITS.has(unitType);
}

/** Every unit type that has a cell on the level, a tall unit counting on each of its levels. */
function unitTypesOnLevel(state: TowerState, level: Level): UnitType[] {
  const types: UnitType[] = [];
  for (const span of state.grid.levels[level]?.occupants ?? []) {
    if (span.occupant.kind !== 'unit') continue;
    const unit = state.units[span.occupant.id];
    if (unit) types.push(unit.type);
  }
  return types;
}

export function isEscalatorFloor(state: TowerState, level: Level): boolean {
  return unitTypesOnLevel(state, level).every(isEscalatorUnit);
}

/** Both levels an escalator links, for every escalator in the tower. */
export function escalatorLevels(state: TowerState): Set<Level> {
  const levels = new Set<Level>();
  for (const transport of Object.values(state.transports)) {
    if (transport.type !== 'escalator') continue;
    levels.add(transport.level);
    const above = levelAbove(transport.level);
    if (above !== null) levels.add(above);
  }
  return levels;
}
