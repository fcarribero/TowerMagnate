import {
  OPEN_HOUR_WEEKLY_UPKEEP,
  SHAFT_UNIT_TYPES,
  TOWER_LAYOUT,
  UNIT_TYPES,
  WEEKLY_UPKEEP,
  type StarRating,
  type TowerState,
  type Unit,
  type UnitType,
  venueHoursOf,
} from '@tower-magnate/shared';
import { WEEKDAYS } from './calendar';
import { chargeMoney } from './money';
import type { ScheduledHook } from './scheduler';
import { emitNews } from './news';

const LOBBY_LEVELS = [TOWER_LAYOUT.mainLobbyFloor, ...TOWER_LAYOUT.skyLobbyFloors];

/** Lobby columns, main and sky: only the lobby's base level counts, its height does not. */
function countLobbyColumns(state: TowerState): number {
  let columns = 0;
  for (const level of LOBBY_LEVELS) {
    for (const span of state.grid.levels[level]?.structure ?? []) {
      if (span.kind === 'lobby') {
        columns += span.x1 - span.x0 + 1;
      }
    }
  }
  return columns;
}

/** How many of each chargeable item exist, in any state. Elevators count cars, not shafts. */
function countUpkeepItems(state: TowerState): Partial<Record<UnitType, number>> {
  const counts: Partial<Record<UnitType, number>> = {};
  const add = (type: UnitType, amount: number) => {
    counts[type] = (counts[type] ?? 0) + amount;
  };
  for (const unit of Object.values(state.units)) {
    add(unit.type, 1);
  }
  for (const transport of Object.values(state.transports)) {
    if (transport.type === 'escalator') {
      add('escalator', 1);
    }
  }
  for (const shaft of Object.values(state.shafts)) {
    add(SHAFT_UNIT_TYPES[shaft.type], shaft.cars.length);
  }
  add('lobby', countLobbyColumns(state));
  return counts;
}

function amountAtStars(type: UnitType, stars: StarRating): number {
  let amount = 0;
  for (const tier of WEEKLY_UPKEEP[type].amountByStars) {
    if (stars >= tier.minStars) {
      amount = tier.amount;
    }
  }
  return amount;
}

/**
 * Upkeep of a commercial type that depends on its opening hours: the hours a day each unit is
 * open (the fast food uses the hours the player set) times the type's rate. A unit that is not
 * active today is shut all day and adds nothing.
 */
function openHoursUpkeep(state: TowerState, type: UnitType): number {
  const rate = OPEN_HOUR_WEEKLY_UPKEEP[type as keyof typeof OPEN_HOUR_WEEKLY_UPKEEP];
  if (rate === undefined) return 0;
  let hours = 0;
  for (const unit of Object.values(state.units)) {
    if (unit.type !== type || !unit.activeToday) continue;
    hours += openHoursOf(unit);
  }
  return Math.round(hours * rate);
}

function openHoursOf(unit: Unit): number {
  const open = venueHoursOf(unit);
  return (open.close - open.open) / 60;
}

/**
 * What one commercial unit adds to the next Monday upkeep for its opening hours, if it is still
 * switched on then. Zero for a unit the player switched off and for types without the line.
 */
export function unitOpenHoursUpkeep(unit: Unit): number {
  const rate = OPEN_HOUR_WEEKLY_UPKEEP[unit.type as keyof typeof OPEN_HOUR_WEEKLY_UPKEEP];
  if (rate === undefined || !unit.enabled) return 0;
  return Math.round(openHoursOf(unit) * rate);
}

/** Charges one upkeep entry per item type with a non-zero total. */
export function chargeWeeklyUpkeep(state: TowerState): void {
  const counts = countUpkeepItems(state);
  for (const type of UNIT_TYPES) {
    const total =
      (counts[type] ?? 0) * amountAtStars(type, state.stars) + openHoursUpkeep(state, type);
    if (total > 0) {
      chargeMoney(state, 'upkeep', total);
    }
  }
}

/** Listed after the ledger week roll, so the upkeep lands in the week it pays for. */
export const weeklyUpkeepHook: ScheduledHook = {
  name: 'weekly-upkeep',
  schedule: { every: 'week', weekday: WEEKDAYS.monday, hour: 0, minute: 0 },
  run(context) {
    const balanceBefore = context.state.money;
    chargeWeeklyUpkeep(context.state);
    context.upkeepCharged = balanceBefore - context.state.money;
    if (balanceBefore >= 0 && context.state.money < 0) {
      context.events.push(...emitNews(context.state, 'news.upkeepNegative'));
    }
  },
};
