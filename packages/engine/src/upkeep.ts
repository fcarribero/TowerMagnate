import {
  SHAFT_UNIT_TYPES,
  TOWER_LAYOUT,
  UNIT_TYPES,
  WEEKLY_UPKEEP,
  type StarRating,
  type TowerState,
  type UnitType,
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

/** Charges one upkeep entry per item type with a non-zero total. */
export function chargeWeeklyUpkeep(state: TowerState): void {
  const counts = countUpkeepItems(state);
  for (const type of UNIT_TYPES) {
    const total = (counts[type] ?? 0) * amountAtStars(type, state.stars);
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
