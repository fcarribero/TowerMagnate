import {
  UNIT_CATALOG,
  UNIT_TYPES,
  type EngineEvent,
  type Level,
  type StarRating,
  type TowerState,
  type UnitType,
} from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { STEPS_PER_DAY } from './clock';
import { step } from './step';
import { buildTower, type PlannedUnit } from './testing';

const STEPS_PER_HOUR = 360;
const FIVE_PM = 17 * STEPS_PER_HOUR;
const FAR_FUTURE = 1_000 * STEPS_PER_DAY;
const OFFICES_PER_LEVEL = 41;
const LAST_OFFICE_LEVEL = 22;

interface TowerSetup {
  stars: StarRating;
  leasedOffices: number;
  others?: readonly UnitType[];
}

function towerWith({ stars, leasedOffices, others = [] }: TowerSetup): TowerState {
  const units: PlannedUnit[] = [];
  for (let index = 0; index < leasedOffices; index++) {
    const level = (2 + Math.floor(index / OFFICES_PER_LEVEL)) as Level;
    units.push({ type: 'office', level, x: (index % OFFICES_PER_LEVEL) * 9 });
  }
  others.forEach((type, index) => {
    const level = (LAST_OFFICE_LEVEL + 1 + Math.floor(index / 10)) as Level;
    units.push({ type, level, x: (index % 10) * 30 });
  });
  const { state } = buildTower({
    lobby: { x0: 0, x1: 374 },
    floors: [{ from: 2, to: 40, x0: 0, x1: 374 }],
    units,
  });
  for (const unit of Object.values(state.units)) {
    if (unit.type === 'office') {
      unit.lease = { anchorStep: 0, nextDueStep: FAR_FUTURE };
    }
  }
  state.stars = stars;
  return state;
}

/** Runs the one step that ends at hh:00 on the given day (day 0 is Monday). */
function runCheckAt(state: TowerState, day: number): { state: TowerState; events: EngineEvent[] } {
  const checkStep = day * STEPS_PER_DAY + FIVE_PM;
  const before = { ...state, step: checkStep - 1 };
  const { state: after, events } = step(before, [], 1);
  return { state: after, events };
}

function newsKeys(events: readonly EngineEvent[]): string[] {
  return events.flatMap((event) => (event.type === 'news' ? [event.key] : []));
}

const TUESDAY = 1;
const SATURDAY = 5;

describe('weekday star check', () => {
  it('raises 1 star to 2 at 300 population and reports the unlocked units once', () => {
    const { state, events } = runCheckAt(towerWith({ stars: 1, leasedOffices: 50 }), TUESDAY);
    expect(state.stars).toBe(2);
    const changed = events.filter((event) => event.type === 'starsChanged');
    expect(changed).toEqual([
      {
        type: 'starsChanged',
        step: TUESDAY * STEPS_PER_DAY + FIVE_PM,
        stars: 2,
        unlocked: UNIT_TYPES.filter((type) => {
          const definition = UNIT_CATALOG[type];
          return 'unlockStars' in definition && definition.unlockStars === 2;
        }),
      },
    ]);
    expect(newsKeys(events)).toEqual(['news.starsUp']);
  });

  it('does nothing below the population threshold, not even alerts', () => {
    const { state, events } = runCheckAt(towerWith({ stars: 2, leasedOffices: 100 }), TUESDAY);
    expect(state.stars).toBe(2);
    expect(events).toEqual([]);
  });

  it('blocks 2 to 3 without security and alerts, then promotes once security exists', () => {
    const blocked = runCheckAt(towerWith({ stars: 2, leasedOffices: 170 }), TUESDAY);
    expect(blocked.state.stars).toBe(2);
    expect(newsKeys(blocked.events)).toEqual(['news.starBlockedSecurity']);

    const secured = runCheckAt(
      towerWith({ stars: 2, leasedOffices: 170, others: ['security'] }),
      TUESDAY + 1,
    );
    expect(secured.state.stars).toBe(3);
  });

  it('does not check on Saturday or Sunday', () => {
    const tower = towerWith({ stars: 1, leasedOffices: 50 });
    for (const day of [SATURDAY, SATURDAY + 1]) {
      const { state, events } = runCheckAt(tower, day);
      expect(state.stars).toBe(1);
      expect(events).toEqual([]);
    }
  });

  it('checks on Monday and Friday', () => {
    for (const day of [0, 4]) {
      expect(runCheckAt(towerWith({ stars: 1, leasedOffices: 50 }), day).state.stars).toBe(2);
    }
  });

  it('rises one step per check even when the next step is also met', () => {
    const tower = towerWith({ stars: 1, leasedOffices: 170, others: ['security'] });
    const first = runCheckAt(tower, TUESDAY);
    expect(first.state.stars).toBe(2);
    expect(runCheckAt(first.state, TUESDAY + 1).state.stars).toBe(3);
  });

  it('runs only at 17:00', () => {
    const tower = towerWith({ stars: 1, leasedOffices: 50 });
    const at1659 = step({ ...tower, step: TUESDAY * STEPS_PER_DAY + FIVE_PM - 2 }, [], 1);
    expect(at1659.state.stars).toBe(1);
    const at1700 = step({ ...tower, step: TUESDAY * STEPS_PER_DAY + FIVE_PM - 1 }, [], 1);
    expect(at1700.state.stars).toBe(2);
    const at1701 = step({ ...tower, step: TUESDAY * STEPS_PER_DAY + FIVE_PM }, [], 1);
    expect(at1701.state.stars).toBe(1);
  });

  it('skips towers at 5 stars and Torre', () => {
    for (const stars of [5, 6] as const) {
      const { state, events } = runCheckAt(towerWith({ stars, leasedOffices: 100 }), TUESDAY);
      expect(state.stars).toBe(stars);
      expect(events).toEqual([]);
    }
  });

  it('draws no random numbers', () => {
    const tower = towerWith({ stars: 1, leasedOffices: 50 });
    expect(runCheckAt(tower, TUESDAY).state.rng).toEqual(tower.rng);
  });
});

describe('3 to 4 requirements', () => {
  const enough = {
    stars: 3,
    leasedOffices: 840,
    others: [
      'suite',
      'suite',
      'recycling-center',
      'recycling-center',
      'recycling-center',
      'medical-center',
    ],
  } as const;

  it('lists every missing requirement in table order', () => {
    const { state, events } = runCheckAt(towerWith({ stars: 3, leasedOffices: 840 }), TUESDAY);
    expect(state.stars).toBe(3);
    expect(newsKeys(events)).toEqual([
      'news.starBlockedVip',
      'news.starBlockedSuites',
      'news.starBlockedRecycling',
      'news.starBlockedMedical',
    ]);
  });

  it('promotes when all are met', () => {
    const tower = { ...towerWith(enough), vipApproved: true };
    expect(runCheckAt(tower, TUESDAY).state.stars).toBe(4);
  });

  it('blocks on a medical failure since the previous check but not before it', () => {
    const base = { ...towerWith(enough), vipApproved: true };
    const monday17 = FIVE_PM;
    const recent = runCheckAt({ ...base, lastMedicalFailureStep: monday17 }, TUESDAY);
    expect(newsKeys(recent.events)).toEqual(['news.starBlockedMedical']);
    const old = runCheckAt({ ...base, lastMedicalFailureStep: monday17 - 1 }, TUESDAY);
    expect(old.state.stars).toBe(4);
  });

  it('counts a weekend parking failure in the Monday window', () => {
    const base = { ...towerWith(enough), vipApproved: true };
    const saturday06 = SATURDAY * STEPS_PER_DAY + 6 * STEPS_PER_HOUR;
    const monday = runCheckAt({ ...base, lastParkingFailureStep: saturday06 }, 7);
    expect(newsKeys(monday.events)).toEqual(['news.starBlockedParking']);
    const tuesday = runCheckAt({ ...base, lastParkingFailureStep: saturday06 }, 8);
    expect(tuesday.state.stars).toBe(4);
  });
});
