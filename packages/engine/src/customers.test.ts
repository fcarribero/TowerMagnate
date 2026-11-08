import {
  CUSTOMER_ARRIVAL,
  PERSON_KINDS,
  PRICE_LEVELS,
  type PriceLevel,
  type TowerState,
  type UnitId,
  type UnitType,
  type VisitedVenueType,
} from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { STEPS_PER_HOUR, STEPS_PER_MINUTE } from './calendar';
import { STEPS_PER_DAY } from './clock';
import { createCustomers, outsideCustomerCount } from './customers';
import { addPerson, slotOfPerson } from './people';
import { createScheduler } from './scheduler';
import { createEngine, step } from './step';
import { buildTower, plainTowerPlan } from './testing';
import { newUnit } from './units';
import { encodeCustomerTrip } from './venue-visitors';

const TUESDAY = 1;
const SATURDAY = 5;
const CUSTOMER_KIND = PERSON_KINDS.indexOf('customer');
const VISITED_TYPES: readonly VisitedVenueType[] = ['fast-food', 'restaurant', 'retail-shop'];

function at(day: number, hour: number, minute = 0): number {
  return day * STEPS_PER_DAY + hour * STEPS_PER_HOUR + minute * STEPS_PER_MINUTE;
}

const planOnly = createEngine({
  commandHandlers: {},
  systems: [createScheduler([createCustomers().planHook])],
});

function letShop(tower: TowerState, id: UnitId): void {
  const unit = tower.units[id];
  if (!unit) throw new Error(`no unit ${id}`);
  unit.lease = { anchorStep: 0, nextDueStep: at(30, 0), weekVisits: 0 };
}

function venueOf(tower: TowerState, id: UnitId) {
  const venue = tower.units[id]?.venue;
  if (!venue) throw new Error(`no venue counts on ${id}`);
  return venue;
}

/** Runs the 00:00 plan of `day` and nothing else. */
function planDay(tower: TowerState, day: number): TowerState {
  const state = structuredClone(tower);
  state.step = at(day, 0) - 1;
  return planOnly.step(state, [], 1).state;
}

describe('outside customers a day', () => {
  const base = { weekend: false, averageStress: null, subway: false } as const;

  it('matches floor(base x price x stress x subway) for every retail price level', () => {
    const expected: Record<PriceLevel, { weekday: number; weekend: number }> = {
      high: { weekday: 14, weekend: 17 },
      normal: { weekday: 20, weekend: 25 },
      low: { weekday: 24, weekend: 30 },
      minimum: { weekday: 28, weekend: 35 },
    };
    for (const priceLevel of PRICE_LEVELS) {
      const shop = { ...base, type: 'retail-shop', priceLevel } as const;
      expect(outsideCustomerCount(shop)).toBe(expected[priceLevel].weekday);
      expect(outsideCustomerCount({ ...shop, weekend: true })).toBe(expected[priceLevel].weekend);
    }
  });

  it('ignores the price level of food venues', () => {
    for (const priceLevel of PRICE_LEVELS) {
      expect(outsideCustomerCount({ ...base, type: 'fast-food', priceLevel })).toBe(20);
      expect(outsideCustomerCount({ ...base, type: 'restaurant', priceLevel, weekend: true })).toBe(
        30,
      );
    }
  });

  it('applies each stress band, with 1.0 when nobody came yesterday', () => {
    const food = { ...base, type: 'fast-food', priceLevel: 'normal' } as const;
    const cases: [number | null, number][] = [
      [null, 20],
      [0, 20],
      [89, 20],
      [90, 16],
      [179, 16],
      [180, 12],
      [540, 12],
    ];
    for (const [averageStress, count] of cases) {
      expect(outsideCustomerCount({ ...food, averageStress })).toBe(count);
    }
  });

  it('applies the subway factor on top, flooring once at the end', () => {
    const shop = { ...base, type: 'retail-shop', subway: true } as const;
    expect(outsideCustomerCount({ ...shop, priceLevel: 'normal' })).toBe(24);
    expect(outsideCustomerCount({ ...shop, priceLevel: 'minimum' })).toBe(33);
    expect(outsideCustomerCount({ ...shop, priceLevel: 'high', averageStress: 200 })).toBe(10);
    expect(
      outsideCustomerCount({ ...shop, priceLevel: 'low', weekend: true, averageStress: 100 }),
    ).toBe(28);
  });
});

describe('the 00:00 customer plan', () => {
  function venueTower() {
    const { state, unitIds } = buildTower({
      ...plainTowerPlan(4, 0, 60),
      units: [
        { type: 'fast-food', x: 0, level: 2 },
        { type: 'restaurant', x: 0, level: 3 },
        { type: 'retail-shop', x: 0, level: 4 },
        { type: 'retail-shop', x: 20, level: 4 },
      ],
    });
    const [food, restaurant, shop, emptyShop] = unitIds as UnitId[];
    letShop(state, shop as UnitId);
    return {
      state,
      food: food as UnitId,
      restaurant: restaurant as UnitId,
      shop: shop as UnitId,
      emptyShop: emptyShop as UnitId,
    };
  }

  it('plans 20 a weekday and 30, 30 and 25 on a weekend at normal price', () => {
    const { state, food, restaurant, shop } = venueTower();
    const tuesday = planDay(state, TUESDAY);
    expect(venueOf(tuesday, food).customers).toHaveLength(20);
    expect(venueOf(tuesday, restaurant).customers).toHaveLength(20);
    expect(venueOf(tuesday, shop).customers).toHaveLength(20);
    const saturday = planDay(state, SATURDAY);
    expect(venueOf(saturday, food).customers).toHaveLength(30);
    expect(venueOf(saturday, restaurant).customers).toHaveLength(30);
    expect(venueOf(saturday, shop).customers).toHaveLength(25);
  });

  it('plans 28 for a shop at minimum price on a weekday', () => {
    const { state, shop } = venueTower();
    (state.units[shop] as { priceLevel: PriceLevel }).priceLevel = 'minimum';
    expect(venueOf(planDay(state, TUESDAY), shop).customers).toHaveLength(28);
  });

  it('gives a shop without a tenant no customers', () => {
    const { state, emptyShop } = venueTower();
    expect(venueOf(planDay(state, TUESDAY), emptyShop).customers).toEqual([]);
  });

  it('applies the subway factor when the tower has a station', () => {
    const { state, food } = venueTower();
    state.units.u99 = newUnit('u99', 'subway-station', 0, -7);
    expect(venueOf(planDay(state, TUESDAY), food).customers).toHaveLength(24);
  });

  it('rolls the day count into the previous-day count and uses its stress', () => {
    const { state, food, shop } = venueTower();
    Object.assign(venueOf(state, food), { countToday: 37, stressSum: 37 * 100, stressTrips: 37 });
    Object.assign(venueOf(state, shop), { countToday: 22, stressSum: 0, stressTrips: 0 });
    const next = planDay(state, TUESDAY);
    expect(venueOf(next, food)).toMatchObject({
      countToday: 0,
      previousDayCount: 37,
      stressSum: 0,
      stressTrips: 0,
    });
    expect(venueOf(next, food).customers).toHaveLength(16);
    expect(venueOf(next, shop).previousDayCount).toBe(22);
    expect(venueOf(next, shop).customers).toHaveLength(20);
  });

  it('keeps every appearance inside the window, earliest first', () => {
    const { state, food, restaurant, shop } = venueTower();
    const tuesday = planDay(state, TUESDAY);
    const windows: [UnitId, VisitedVenueType][] = [
      [food, 'fast-food'],
      [restaurant, 'restaurant'],
      [shop, 'retail-shop'],
    ];
    for (const [id, type] of windows) {
      const parts = CUSTOMER_ARRIVAL[type];
      const first = at(TUESDAY, 0) + (parts[0]?.from ?? 0) * STEPS_PER_MINUTE;
      const last = at(TUESDAY, 0) + ((parts.at(-1)?.to ?? 0) - 1) * STEPS_PER_MINUTE;
      const steps = venueOf(tuesday, id).customers;
      expect(steps).toEqual([...steps].sort((a, b) => a - b));
      for (const appears of steps) {
        expect(appears).toBeGreaterThanOrEqual(first);
        expect(appears).toBeLessThanOrEqual(last);
        expect(appears % STEPS_PER_MINUTE).toBe(0);
      }
    }
  });
});

describe('arrival spread over seeds 1 to 5', () => {
  const VENUES_PER_TYPE = 10;

  function manyVenues(seed: number) {
    const units = VISITED_TYPES.flatMap((type, typeIndex) =>
      Array.from({ length: VENUES_PER_TYPE }, (_, index) => ({
        type: type as UnitType,
        x: 0,
        level: typeIndex * VENUES_PER_TYPE + index + 2,
      })),
    );
    const { state, unitIds } = buildTower({
      seed,
      ...plainTowerPlan(VISITED_TYPES.length * VENUES_PER_TYPE + 1, 0, 60),
      units,
    });
    for (const id of unitIds) if (state.units[id]?.type === 'retail-shop') letShop(state, id);
    return state;
  }

  it('matches every window share within 3 points and the expected counts', () => {
    const minutesByType = new Map<VisitedVenueType, number[]>();
    for (let seed = 1; seed <= 5; seed++) {
      const tower = planDay(manyVenues(seed), TUESDAY);
      for (const unit of Object.values(tower.units)) {
        const type = unit.type as VisitedVenueType;
        const minutes = (unit.venue?.customers ?? []).map(
          (appears) => (appears - at(TUESDAY, 0)) / STEPS_PER_MINUTE,
        );
        minutesByType.set(type, [...(minutesByType.get(type) ?? []), ...minutes]);
      }
    }
    for (const type of VISITED_TYPES) {
      const minutes = minutesByType.get(type) ?? [];
      const expectedCount = 20 * VENUES_PER_TYPE * 5;
      expect(Math.abs(minutes.length - expectedCount)).toBeLessThanOrEqual(expectedCount * 0.05);
      for (const part of CUSTOMER_ARRIVAL[type]) {
        const inPart = minutes.filter((minute) => minute >= part.from && minute < part.to);
        const share = (inPart.length / minutes.length) * 100;
        expect(Math.abs(share - part.weight), `${type} ${part.from}`).toBeLessThanOrEqual(3);
      }
    }
  });
});

describe('customers in the tower', () => {
  function streetVenue(type: VisitedVenueType) {
    const { state, unitIds } = buildTower({
      ...plainTowerPlan(1, 0, 80),
      units: [{ type: type as UnitType, x: 30, level: 1 }],
    });
    const id = unitIds[0] as UnitId;
    if (type === 'retail-shop') letShop(state, id);
    return { state, id };
  }

  function customersIn(tower: TowerState): number {
    return tower.people.kind.filter((kind) => kind === CUSTOMER_KIND).length;
  }

  it('come only while the venue is open and all leave by the end of the day', () => {
    const { state, id } = streetVenue('fast-food');
    state.step = at(TUESDAY, 0) - 1;
    let tower = step(state, [], 1).state;
    expect(venueOf(tower, id).customers).toHaveLength(20);

    const countedAt: number[] = [];
    while (tower.step < at(TUESDAY, 23, 59)) {
      const before = venueOf(tower, id).countToday;
      tower = step(tower, [], STEPS_PER_MINUTE).state;
      const minute = (tower.step % STEPS_PER_DAY) / STEPS_PER_MINUTE;
      for (let count = before; count < venueOf(tower, id).countToday; count++) {
        countedAt.push(minute);
      }
    }
    expect(countedAt).toHaveLength(20);
    for (const minute of countedAt) {
      expect(minute).toBeGreaterThanOrEqual(8 * 60);
      expect(minute).toBeLessThanOrEqual(20 * 60);
    }
    expect(customersIn(tower)).toBe(0);

    tower = step(tower, [], STEPS_PER_MINUTE).state;
    expect(venueOf(tower, id)).toMatchObject({ previousDayCount: 20, countToday: 0 });
  });

  it('leave without a visit when they arrive after closing', () => {
    const { state, id } = streetVenue('fast-food');
    state.step = at(TUESDAY, 19, 59);
    venueOf(state, id).customers = [at(TUESDAY, 20)];
    const tower = step(state, [], 30 * STEPS_PER_MINUTE).state;
    expect(venueOf(tower, id).countToday).toBe(0);
    expect(customersIn(tower)).toBe(0);
  });

  function shopWithCustomersInside(inside: number) {
    const { state, id } = streetVenue('retail-shop');
    state.step = at(TUESDAY, 11, 59);
    for (let index = 0; index < inside; index++) {
      const personId = addPerson(state, {
        kind: 'customer',
        homeUnit: Number(id.slice(1)),
        level: 1,
        column: 35,
      });
      const slot = slotOfPerson(state.people, personId);
      state.people.trip[slot] = encodeCustomerTrip({ phase: 'atVenue', onRight: false });
      state.people.dueStep[slot] = at(TUESDAY, 18);
    }
    venueOf(state, id).customers = [at(TUESDAY, 12)];
    return { state, id };
  }

  it('are turned away by a full venue', () => {
    const { state, id } = shopWithCustomersInside(25);
    const tower = step(state, [], 30 * STEPS_PER_MINUTE).state;
    expect(venueOf(tower, id).countToday).toBe(0);
    expect(customersIn(tower)).toBe(25);
  });

  it('go in when one place is left, and record the trip stress', () => {
    const { state, id } = shopWithCustomersInside(24);
    const tower = step(state, [], 30 * STEPS_PER_MINUTE).state;
    expect(venueOf(tower, id)).toMatchObject({ countToday: 1, stressTrips: 1 });
    expect(customersIn(tower)).toBe(25);
  });

  it("count toward the shop's week, so a street shop they visit stays past its first week", () => {
    const { state, id } = streetVenue('retail-shop');
    const shop = state.units[id];
    if (!shop) throw new Error(`no unit ${id}`);
    shop.lease = { anchorStep: at(TUESDAY, 0), nextDueStep: at(TUESDAY + 7, 0), weekVisits: 0 };
    state.step = at(TUESDAY, 0) - 1;
    const beforeCheck = step(state, [], 7 * STEPS_PER_DAY).state;
    const weekVisits = beforeCheck.units[id]?.lease?.weekVisits ?? 0;
    expect(weekVisits).toBeGreaterThanOrEqual(70);

    const { state: after, events } = step(beforeCheck, [], 1);
    expect(after.units[id]?.lease).toMatchObject({
      nextDueStep: at(TUESDAY + 14, 0),
      weekVisits: 0,
    });
    expect(events.filter((event) => event.type === 'leaseEnded')).toHaveLength(0);
  });

  it('stay the venue time and then leave the tower', () => {
    const { state, id } = streetVenue('restaurant');
    state.step = at(TUESDAY, 17, 59);
    venueOf(state, id).customers = [at(TUESDAY, 18)];
    const inside = step(state, [], 50 * STEPS_PER_MINUTE).state;
    expect(venueOf(inside, id).countToday).toBe(1);
    expect(customersIn(inside)).toBe(1);
    const gone = step(inside, [], 30 * STEPS_PER_MINUTE).state;
    expect(customersIn(gone)).toBe(0);
  });
});
