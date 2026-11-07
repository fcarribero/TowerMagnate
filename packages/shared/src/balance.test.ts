import { describe, expect, it } from 'vitest';
import {
  CINEMA_MOVIE_CHANGE_COST,
  CONDO_SALE_PRICE,
  DAILY_INCOME_BRACKETS,
  DEFAULT_PRICE_LEVEL,
  HOTEL_NIGHTLY_PRICE,
  MONEY_CAP,
  STAR_POPULATION_THRESHOLDS,
  STARTING_MONEY,
  TOWER_LAYOUT,
  TOWER_LIMITS,
  UNIT_CATALOG,
  WEEKLY_RENT,
  WEEKLY_UPKEEP,
} from './balance';
import { UNIT_TYPES, type LimitGroupId, type UnitCost, type UnitType } from './units';

interface GddUnitRow {
  type: UnitType;
  name: string;
  width: number;
  floors: number | readonly number[] | 'shaft';
  cost: UnitCost;
  people: number | null;
  stars: number;
}

function unit(amount: number): UnitCost {
  return { kind: 'per-unit', amount };
}

function shaft(shaftAmount: number, perCarAmount: number): UnitCost {
  return { kind: 'shaft', shaftAmount, perCarAmount };
}

// One row per line of the GDD "Unidades y desbloqueos" table.
const GDD_UNIT_TABLE: GddUnitRow[] = [
  {
    type: 'floor',
    name: 'Piso',
    width: 1,
    floors: 1,
    cost: { kind: 'per-cell', amount: 500 },
    people: null,
    stars: 1,
  },
  {
    type: 'lobby',
    name: 'Lobby',
    width: 1,
    floors: [1, 2, 3],
    cost: { kind: 'per-cell', amount: 5_000 },
    people: null,
    stars: 1,
  },
  {
    type: 'stairs',
    name: 'Escalera',
    width: 8,
    floors: 2,
    cost: unit(5_000),
    people: null,
    stars: 1,
  },
  {
    type: 'escalator',
    name: 'Escalera mecánica',
    width: 8,
    floors: 2,
    cost: unit(20_000),
    people: null,
    stars: 1,
  },
  {
    type: 'standard-elevator',
    name: 'Ascensor estándar',
    width: 4,
    floors: 'shaft',
    cost: shaft(200_000, 80_000),
    people: 21,
    stars: 1,
  },
  { type: 'office', name: 'Oficina', width: 9, floors: 1, cost: unit(40_000), people: 6, stars: 1 },
  {
    type: 'condo',
    name: 'Departamento',
    width: 16,
    floors: 1,
    cost: unit(80_000),
    people: 3,
    stars: 1,
  },
  {
    type: 'fast-food',
    name: 'Comida rápida',
    width: 16,
    floors: 1,
    cost: unit(100_000),
    people: null,
    stars: 1,
  },
  {
    type: 'single-room',
    name: 'Habitación simple',
    width: 4,
    floors: 1,
    cost: unit(20_000),
    people: 1,
    stars: 2,
  },
  {
    type: 'double-room',
    name: 'Habitación doble',
    width: 6,
    floors: 1,
    cost: unit(50_000),
    people: 2,
    stars: 2,
  },
  { type: 'suite', name: 'Suite', width: 10, floors: 1, cost: unit(100_000), people: 2, stars: 2 },
  {
    type: 'housekeeping',
    name: 'Limpieza',
    width: 15,
    floors: 1,
    cost: unit(50_000),
    people: 6,
    stars: 2,
  },
  {
    type: 'security',
    name: 'Seguridad',
    width: 16,
    floors: 1,
    cost: unit(100_000),
    people: null,
    stars: 2,
  },
  {
    type: 'service-elevator',
    name: 'Ascensor de servicio',
    width: 4,
    floors: 'shaft',
    cost: shaft(100_000, 50_000),
    people: 21,
    stars: 2,
  },
  {
    type: 'restaurant',
    name: 'Restaurante',
    width: 24,
    floors: 1,
    cost: unit(200_000),
    people: null,
    stars: 3,
  },
  {
    type: 'retail-shop',
    name: 'Local comercial',
    width: 12,
    floors: 1,
    cost: unit(100_000),
    people: null,
    stars: 3,
  },
  {
    type: 'cinema',
    name: 'Cine',
    width: 31,
    floors: 2,
    cost: unit(500_000),
    people: 120,
    stars: 3,
  },
  {
    type: 'party-hall',
    name: 'Salón de fiestas',
    width: 24,
    floors: 2,
    cost: unit(100_000),
    people: 50,
    stars: 3,
  },
  {
    type: 'express-elevator',
    name: 'Ascensor expreso',
    width: 6,
    floors: 'shaft',
    cost: shaft(400_000, 150_000),
    people: 42,
    stars: 3,
  },
  {
    type: 'medical-center',
    name: 'Centro médico',
    width: 26,
    floors: 1,
    cost: unit(500_000),
    people: null,
    stars: 3,
  },
  {
    type: 'parking-ramp',
    name: 'Rampa de estacionamiento',
    width: 16,
    floors: 1,
    cost: unit(50_000),
    people: null,
    stars: 3,
  },
  {
    type: 'parking-space',
    name: 'Cochera',
    width: 4,
    floors: 1,
    cost: unit(3_000),
    people: null,
    stars: 3,
  },
  {
    type: 'recycling-center',
    name: 'Centro de reciclaje',
    width: 25,
    floors: 2,
    cost: unit(500_000),
    people: null,
    stars: 3,
  },
  {
    type: 'subway-station',
    name: 'Estación de subte',
    width: 30,
    floors: 3,
    cost: unit(1_000_000),
    people: null,
    stars: 4,
  },
  {
    type: 'cathedral',
    name: 'Catedral',
    width: 28,
    floors: 4,
    cost: unit(3_000_000),
    people: 40,
    stars: 5,
  },
];

function floorsOf(type: UnitType): GddUnitRow['floors'] {
  const height = UNIT_CATALOG[type].height;
  if (height.kind === 'fixed') return height.floors;
  if (height.kind === 'choice') return height.floors;
  return 'shaft';
}

describe('unit catalog', () => {
  it('has exactly the 25 GDD units, keyed by their own type', () => {
    expect(UNIT_TYPES).toHaveLength(25);
    expect(Object.keys(UNIT_CATALOG).sort()).toEqual([...UNIT_TYPES].sort());
    for (const type of UNIT_TYPES) {
      expect(UNIT_CATALOG[type].type).toBe(type);
    }
  });

  it.each(GDD_UNIT_TABLE)('matches the GDD row for $type', (row) => {
    const definition = UNIT_CATALOG[row.type];
    expect(definition.name).toBe(row.name);
    expect(definition.width).toBe(row.width);
    expect(floorsOf(row.type)).toEqual(row.floors);
    expect(definition.cost).toEqual(row.cost);
    expect(definition.capacity?.people ?? null).toBe(row.people);
    expect(definition.unlockStars).toBe(row.stars);
  });

  it('marks customer-driven units with a customer capacity and no fixed count', () => {
    for (const type of ['fast-food', 'restaurant', 'retail-shop'] as const) {
      expect(UNIT_CATALOG[type].capacity).toEqual({ role: 'customers', people: null });
    }
  });

  it('limits standard and service shafts to 30 floors and leaves express unlimited', () => {
    expect(UNIT_CATALOG['standard-elevator'].height).toEqual({
      kind: 'shaft',
      maxFloorsServed: 30,
    });
    expect(UNIT_CATALOG['service-elevator'].height).toEqual({ kind: 'shaft', maxFloorsServed: 30 });
    expect(UNIT_CATALOG['express-elevator'].height).toEqual({
      kind: 'shaft',
      maxFloorsServed: null,
    });
  });
});

describe('placement flags', () => {
  it('keeps parking, recycling and subway in basements', () => {
    expect(UNIT_CATALOG['parking-ramp'].placement.zone).toBe('basement');
    expect(UNIT_CATALOG['parking-space'].placement.zone).toBe('basement');
    expect(UNIT_CATALOG['recycling-center'].placement.zone).toBe('basement');
    expect(UNIT_CATALOG['subway-station'].placement.zone).toBe('lowest-basement');
  });

  it('ties parking spaces to a ramp, ramps to one column and recycling to an existing one', () => {
    expect(UNIT_CATALOG['parking-space'].placement.mustConnectTo).toBe('parking-ramp');
    expect(UNIT_CATALOG['parking-ramp'].placement.alignedWithExistingSameUnit).toBe(true);
    expect(UNIT_CATALOG['recycling-center'].placement.mustTouchExistingSameUnit).toBe(true);
  });

  it('allows escalators only on lobby, commercial, entertainment or single-room floors', () => {
    expect(UNIT_CATALOG.escalator.placement.allowedFloorUses).toEqual([
      'lobby',
      'commercial',
      'entertainment',
      'single-room',
    ]);
  });

  it('sets the elevator rules', () => {
    const shafts = ['standard-elevator', 'service-elevator', 'express-elevator'] as const;
    for (const type of shafts) {
      expect(UNIT_CATALOG[type].placement.maxCarsPerShaft).toBe(8);
      expect(UNIT_CATALOG[type].placement.mustBeSeparatedFromOtherShafts).toBe(true);
    }
    expect(UNIT_CATALOG['express-elevator'].placement.elevatorStops).toBe(
      'basements-main-and-sky-lobbies',
    );
    expect(UNIT_CATALOG['service-elevator'].placement.staffOnly).toBe(true);
  });

  it('puts lobbies on lobby floors and the cathedral above floor 100', () => {
    expect(UNIT_CATALOG.lobby.placement.zone).toBe('lobby-floors');
    expect(UNIT_CATALOG.cathedral.placement.zone).toBe('above-top-floor');
    expect(TOWER_LAYOUT.skyLobbyFloors).toEqual([15, 30, 45, 60, 75, 90]);
  });
});

describe('tower limits', () => {
  it('matches the GDD limits per tower', () => {
    expect(TOWER_LIMITS).toEqual({
      'elevator-shafts': 24,
      'stairs-and-escalators': 64,
      security: 10,
      medical: 10,
      entertainment: 16,
      commercial: 512,
      parking: 512,
      subway: 1,
      cathedral: 1,
    });
  });

  it('assigns each limited unit to its group', () => {
    const membersOf = (group: LimitGroupId) =>
      UNIT_TYPES.filter((type) => UNIT_CATALOG[type].limitGroup === group).sort();

    expect(membersOf('elevator-shafts')).toEqual([
      'express-elevator',
      'service-elevator',
      'standard-elevator',
    ]);
    expect(membersOf('stairs-and-escalators')).toEqual(['escalator', 'stairs']);
    expect(membersOf('security')).toEqual(['security']);
    expect(membersOf('medical')).toEqual(['medical-center']);
    expect(membersOf('entertainment')).toEqual(['cinema', 'party-hall']);
    expect(membersOf('commercial')).toEqual(['fast-food', 'restaurant', 'retail-shop']);
    expect(membersOf('parking')).toEqual(['parking-space']);
    expect(membersOf('subway')).toEqual(['subway-station']);
    expect(membersOf('cathedral')).toEqual(['cathedral']);
  });
});

describe('money and stars', () => {
  it('starts at $2,000,000 and caps at $99,999,999', () => {
    expect(STARTING_MONEY).toBe(2_000_000);
    expect(MONEY_CAP).toBe(99_999_999);
  });

  it('uses the GDD population thresholds', () => {
    expect(STAR_POPULATION_THRESHOLDS).toEqual({
      1: 300,
      2: 1_000,
      3: 5_000,
      4: 10_000,
      5: 15_000,
    });
  });
});

describe('price tables', () => {
  it('defaults to the normal level', () => {
    expect(DEFAULT_PRICE_LEVEL).toBe('normal');
  });

  it('matches the weekly rents for all four levels', () => {
    expect(WEEKLY_RENT.office).toEqual({
      high: 15_000,
      normal: 10_000,
      low: 5_000,
      minimum: 2_000,
    });
    expect(WEEKLY_RENT['retail-shop']).toEqual({
      high: 20_000,
      normal: 15_000,
      low: 10_000,
      minimum: 4_000,
    });
  });

  it('matches the hotel nightly prices for all four levels', () => {
    expect(HOTEL_NIGHTLY_PRICE['single-room']).toEqual({
      high: 3_000,
      normal: 2_000,
      low: 1_500,
      minimum: 500,
    });
    expect(HOTEL_NIGHTLY_PRICE['double-room']).toEqual({
      high: 4_500,
      normal: 3_000,
      low: 2_000,
      minimum: 800,
    });
    expect(HOTEL_NIGHTLY_PRICE.suite).toEqual({
      high: 9_000,
      normal: 6_000,
      low: 4_000,
      minimum: 1_500,
    });
  });

  it('matches the condo sale prices for all four levels', () => {
    expect(CONDO_SALE_PRICE).toEqual({
      high: 200_000,
      normal: 150_000,
      low: 100_000,
      minimum: 40_000,
    });
  });
});

describe('daily income brackets', () => {
  it('matches fast food, restaurant, cinema and party hall', () => {
    expect(DAILY_INCOME_BRACKETS['fast-food']).toEqual([
      { minCustomers: 0, amount: -3_000 },
      { minCustomers: 25, amount: 2_000 },
      { minCustomers: 35, amount: 3_000 },
      { minCustomers: 50, amount: 5_000 },
    ]);
    expect(DAILY_INCOME_BRACKETS.restaurant).toEqual([
      { minCustomers: 0, amount: -6_000 },
      { minCustomers: 25, amount: 4_000 },
      { minCustomers: 35, amount: 6_000 },
      { minCustomers: 50, amount: 10_000 },
    ]);
    expect(DAILY_INCOME_BRACKETS.cinema).toEqual([
      { minCustomers: 0, amount: 0 },
      { minCustomers: 40, amount: 2_000 },
      { minCustomers: 80, amount: 10_000 },
      { minCustomers: 100, amount: 15_000 },
    ]);
    expect(DAILY_INCOME_BRACKETS['party-hall']).toEqual([
      { minCustomers: 0, amount: 0 },
      { minCustomers: 1, amount: 20_000 },
    ]);
    expect(CINEMA_MOVIE_CHANGE_COST).toBe(300_000);
  });

  it('keeps every bracket list sorted and starting at zero customers', () => {
    for (const brackets of Object.values(DAILY_INCOME_BRACKETS)) {
      expect(brackets[0]?.minCustomers).toBe(0);
      const thresholds = brackets.map((bracket) => bracket.minCustomers);
      expect(thresholds).toEqual([...thresholds].sort((a, b) => a - b));
    }
  });
});

describe('weekly upkeep', () => {
  it('matches the GDD upkeep table', () => {
    const flat = (basis: string, amount: number) => ({
      basis,
      amountByStars: [{ minStars: 1, amount }],
    });
    expect(WEEKLY_UPKEEP).toEqual({
      'standard-elevator': flat('per-car', 10_000),
      'service-elevator': flat('per-car', 10_000),
      'express-elevator': flat('per-car', 20_000),
      escalator: flat('per-unit', 5_000),
      housekeeping: flat('per-unit', 10_000),
      security: flat('per-unit', 20_000),
      'parking-ramp': flat('per-unit', 10_000),
      'recycling-center': flat('per-unit', 50_000),
      'subway-station': flat('per-unit', 100_000),
      lobby: {
        basis: 'per-cell',
        amountByStars: [
          { minStars: 1, amount: 0 },
          { minStars: 3, amount: 300 },
          { minStars: 4, amount: 1_000 },
        ],
      },
    });
  });
});
