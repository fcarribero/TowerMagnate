import {
  CINEMA_CHANGE_FILM_FROM_AGE_DAYS,
  CINEMA_CHANGE_FILM_REPEAT_DAYS,
  CINEMA_MOVIE_CHANGE_COST,
  CINEMA_SHOW_CAPS,
  type TowerState,
  type Unit,
} from '@tower-magnate/shared';
import { STEPS_PER_DAY } from './clock';
import type { CommandHandler } from './step';
import { chargeMoney } from './money';
import { emitNews } from './news';
import type { ScheduledHook } from './scheduler';

function dayOf(step: number): number {
  return Math.floor(step / STEPS_PER_DAY);
}

/** Whole days since the cinema's film started, 0 on the start day; null for any other unit. */
export function filmAgeDays(state: TowerState, unit: Unit): number | null {
  if (unit.type !== 'cinema' || !unit.venue) return null;
  const startStep = unit.venue.filmChangedAtStep ?? unit.placedAtStep;
  return dayOf(state.step) - dayOf(startStep);
}

/** The most people a show admits for a film of this age. */
export function cinemaShowCap(ageDays: number): number {
  let cap = CINEMA_SHOW_CAPS[0]?.cap ?? 0;
  for (const band of CINEMA_SHOW_CAPS) {
    if (ageDays >= band.fromAgeDays) cap = band.cap;
  }
  return cap;
}

export const changeFilm: CommandHandler<'changeFilm'> = (context, command) => {
  const { state } = context;
  if (typeof command.unitId !== 'string') {
    return { ok: false, error: 'INVALID_COMMAND' };
  }
  const unit = Object.hasOwn(state.units, command.unitId) ? state.units[command.unitId] : undefined;
  if (!unit) {
    return { ok: false, error: 'UNKNOWN_ENTITY' };
  }
  if (unit.type !== 'cinema' || !unit.venue) {
    return { ok: false, error: 'NOT_A_CINEMA' };
  }
  if (state.money < 0) {
    return { ok: false, error: 'NEGATIVE_BALANCE' };
  }
  if (state.money < CINEMA_MOVIE_CHANGE_COST) {
    return { ok: false, error: 'INSUFFICIENT_FUNDS' };
  }

  chargeMoney(state, 'films', CINEMA_MOVIE_CHANGE_COST);
  unit.venue.filmChangedAtStep = state.step;
  return { ok: true, cost: CINEMA_MOVIE_CHANGE_COST, refund: 0, events: [] };
};

function asksForNewFilm(ageDays: number): boolean {
  const overdueDays = ageDays - CINEMA_CHANGE_FILM_FROM_AGE_DAYS;
  return overdueDays >= 0 && overdueDays % CINEMA_CHANGE_FILM_REPEAT_DAYS === 0;
}

export const filmNewsHook: ScheduledHook = {
  name: 'cinema-film-news',
  schedule: { every: 'day', hour: 8, minute: 0 },
  run(context) {
    for (const unit of Object.values(context.state.units)) {
      const age = filmAgeDays(context.state, unit);
      if (age !== null && asksForNewFilm(age)) {
        context.events.push(
          ...emitNews(context.state, 'news.cinemaChangeFilm', { unitId: unit.id }),
        );
      }
    }
  },
};
