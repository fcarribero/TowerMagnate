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
import { nextCheckWindowStart, nextStarRequirements } from './stars';
import { step } from './step';
import { buildTower, type PlannedUnit } from './testing';

const STEPS_PER_HOUR = 360;
const FIVE_PM = 17 * STEPS_PER_HOUR;
const FAR_FUTURE = 1_000 * STEPS_PER_DAY;
const OFFICES_PER_LEVEL = 41;
const OTHER_UNIT_ROWS = 5;

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
  const firstOtherLevel = 2 + Math.ceil(leasedOffices / OFFICES_PER_LEVEL);
  others.forEach((type, index) => {
    const level = (firstOtherLevel + Math.floor(index / 10)) as Level;
    units.push({ type, level, x: (index % 10) * 30 });
  });
  const { state } = buildTower({
    lobby: { x0: 0, x1: 374 },
    floors: [{ from: 2, to: (firstOtherLevel + OTHER_UNIT_ROWS) as Level, x0: 0, x1: 374 }],
    units,
  });
  for (const unit of Object.values(state.units)) {
    if (unit.type === 'office') {
      unit.lease = { anchorStep: 0, nextDueStep: FAR_FUTURE, weekVisits: 0 };
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

  it('blocks on a missing VIP approval alone', () => {
    const { state, events } = runCheckAt(towerWith(enough), TUESDAY);
    expect(state.stars).toBe(3);
    expect(newsKeys(events)).toEqual(['news.starBlockedVip']);
  });

  it('does not count an infested suite', () => {
    const tower = { ...towerWith(enough), vipApproved: true };
    const suite = Object.values(tower.units).find((unit) => unit.type === 'suite');
    if (!suite?.hotel) throw new Error('expected a suite');
    suite.hotel.state = 'infested';
    expect(newsKeys(runCheckAt(tower, TUESDAY).events)).toEqual(['news.starBlockedSuites']);
  });

  it('blocks when the recycling centers hold fewer people than the population', () => {
    const twoCenters = enough.others.filter(
      (type, index) => type !== 'recycling-center' || index > 2,
    );
    const tower = { ...towerWith({ ...enough, others: twoCenters }), vipApproved: true };
    expect(newsKeys(runCheckAt(tower, TUESDAY).events)).toEqual(['news.starBlockedRecycling']);
  });

  it('blocks without a medical center even with no failed visit', () => {
    const noMedical = enough.others.filter((type) => type !== 'medical-center');
    const tower = { ...towerWith({ ...enough, others: noMedical }), vipApproved: true };
    expect(newsKeys(runCheckAt(tower, TUESDAY).events)).toEqual(['news.starBlockedMedical']);
  });

  it('leaves a failure at the check step itself to the next check', () => {
    const tuesdayCheck = TUESDAY * STEPS_PER_DAY + FIVE_PM;
    const base = {
      ...towerWith(enough),
      vipApproved: true,
      lastMedicalFailureStep: tuesdayCheck,
      lastParkingFailureStep: tuesdayCheck,
    };
    expect(runCheckAt(base, TUESDAY).state.stars).toBe(4);
    expect(newsKeys(runCheckAt(base, TUESDAY + 1).events)).toEqual([
      'news.starBlockedMedical',
      'news.starBlockedParking',
    ]);
  });
});

describe('4 to 5 requirements', () => {
  const enough = {
    stars: 4,
    leasedOffices: 1_667,
    others: [
      'recycling-center',
      'recycling-center',
      'recycling-center',
      'recycling-center',
      'recycling-center',
      'medical-center',
      'subway-station',
    ],
  } as const;

  it('promotes at 10,000 population with subway, medical, recycling and parking met', () => {
    expect(runCheckAt(towerWith(enough), TUESDAY).state.stars).toBe(5);
  });

  it('blocks without a subway station', () => {
    const noSubway = enough.others.filter((type) => type !== 'subway-station');
    const { state, events } = runCheckAt(towerWith({ ...enough, others: noSubway }), TUESDAY);
    expect(state.stars).toBe(4);
    expect(newsKeys(events)).toEqual(['news.starBlockedSubway']);
  });

  it('blocks after one of five recycling centers is removed at 10,002 population', () => {
    const tower = towerWith(enough);
    const center = Object.values(tower.units).find((unit) => unit.type === 'recycling-center');
    if (!center) throw new Error('expected a recycling center');
    tower.units = Object.fromEntries(
      Object.entries(tower.units).filter(([id]) => id !== center.id),
    );
    expect(newsKeys(runCheckAt(tower, TUESDAY).events)).toEqual(['news.starBlockedRecycling']);
  });

  it('blocks on medical and parking failures in the window', () => {
    const monday20 = 20 * STEPS_PER_HOUR;
    const tower = {
      ...towerWith(enough),
      lastMedicalFailureStep: monday20,
      lastParkingFailureStep: monday20,
    };
    expect(newsKeys(runCheckAt(tower, TUESDAY).events)).toEqual([
      'news.starBlockedMedical',
      'news.starBlockedParking',
    ]);
  });
});

describe('next star requirements', () => {
  it('reports each requirement of the next step with whether it is met', () => {
    const tower = towerWith({ stars: 3, leasedOffices: 10, others: ['suite', 'suite'] });
    expect(nextStarRequirements(tower)).toEqual([
      { requirement: 'vip', met: false },
      { requirement: 'suites', met: true },
      { requirement: 'recycling', met: false },
      { requirement: 'medical', met: false },
      { requirement: 'parking', met: true },
    ]);
  });

  it('needs the cathedral and a wedding for the Torre rank', () => {
    const withCathedral = towerWith({ stars: 5, leasedOffices: 10, others: ['cathedral'] });
    expect(nextStarRequirements(withCathedral)).toEqual([
      { requirement: 'cathedral', met: true },
      { requirement: 'wedding', met: false },
    ]);
    const without = towerWith({ stars: 5, leasedOffices: 10 });
    expect(nextStarRequirements(without)[0]).toEqual({ requirement: 'cathedral', met: false });
  });

  it('is empty at the Torre rank', () => {
    expect(nextStarRequirements(towerWith({ stars: 6, leasedOffices: 10 }))).toEqual([]);
  });

  it('counts failures since the last check, including one after it today', () => {
    const tuesday20 = TUESDAY * STEPS_PER_DAY + 20 * STEPS_PER_HOUR;
    const tower = { ...towerWith({ stars: 4, leasedOffices: 10 }), step: tuesday20 };
    const parking = (failureStep: number) =>
      nextStarRequirements({ ...tower, lastParkingFailureStep: failureStep }).find(
        (status) => status.requirement === 'parking',
      );
    expect(parking(tuesday20 - STEPS_PER_HOUR)?.met).toBe(false);
    expect(parking(TUESDAY * STEPS_PER_DAY + FIVE_PM - 1)?.met).toBe(true);
  });
});

describe('next check window start', () => {
  const at = (day: number, hour: number) => day * STEPS_PER_DAY + hour * STEPS_PER_HOUR;

  it('is the latest weekday 17:00 at or before the step', () => {
    expect(nextCheckWindowStart(at(TUESDAY, 10))).toBe(at(0, 17));
    expect(nextCheckWindowStart(at(TUESDAY, 17))).toBe(at(TUESDAY, 17));
    expect(nextCheckWindowStart(at(SATURDAY, 9))).toBe(at(4, 17));
    expect(nextCheckWindowStart(at(7, 16))).toBe(at(4, 17));
  });

  it('is step 0 before the first check', () => {
    expect(nextCheckWindowStart(at(0, 10))).toBe(0);
  });
});
