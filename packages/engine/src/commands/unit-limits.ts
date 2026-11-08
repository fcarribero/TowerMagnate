import {
  TOWER_LIMITS,
  UNIT_CATALOG,
  type ErrorCode,
  type TowerState,
  type UnitDefinition,
} from '@tower-magnate/shared';

/** C-51: the tower needs the star rating the catalog asks for. */
export function starLockError(state: TowerState, definition: UnitDefinition): ErrorCode | null {
  return state.stars < definition.unlockStars ? 'STAR_LOCKED' : null;
}

/** C-57: no security office while a bomb threat is active. */
export function bombLockError(state: TowerState, definition: UnitDefinition): ErrorCode | null {
  const threatActive = state.activeEvents.some((event) => event.kind === 'bomb');
  return definition.type === 'security' && threatActive ? 'BOMB_EVENT_ACTIVE' : null;
}

/** C-52 and C-53: units of a limit group, counted from the units standing now. */
export function limitError(state: TowerState, definition: UnitDefinition): ErrorCode | null {
  const group = definition.limitGroup;
  if (group === null) return null;
  const standing = Object.values(state.units).filter(
    (unit) => UNIT_CATALOG[unit.type].limitGroup === group,
  ).length;
  return standing >= TOWER_LIMITS[group] ? 'LIMIT_REACHED' : null;
}
