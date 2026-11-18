import { stepOfDate } from '@tower-magnate/engine/calendar';
import { describe, expect, it } from 'vitest';
import type { UnitInspect } from '../../model/inspectStore';
import {
  evaluationReasons,
  evaluationView,
  filmChangeState,
  groupUnitRows,
  levelText,
  locationText,
  isSoldCondo,
  appraisalPercent,
  clampHours,
  clampPrice,
  listedOf,
  priorityOf,
  peopleGroups,
  priceBandLabel,
  priceControlOf,
  unitRows,
  unitSubtitle,
  venueChart,
  unitTitle,
  upgradeRows,
} from './unitWindowModel';

type Details = NonNullable<UnitInspect['details']>;
type Lease = Extract<Details, { group: 'lease' }>;
type Condo = Extract<Details, { group: 'condo' }>;
type Hotel = Extract<Details, { group: 'hotel' }>;

const lease: Lease = {
  group: 'lease',
  state: 'occupied',
  persons: 4,
  capacity: 6,
  evaluation: 'fair',
  price: 10_500,
  appraisal: 10_000,
  priceBand: 'high',
  priceMin: 2_000,
  priceMax: 20_000,
  priceStep: 1,
  occupantScore: 3,
  listed: true,
  weeklyRent: 10_500,
  nextPaymentStep: stepOfDate({ year: 1, month: 1, day: 5, hour: 9 }),
  workers: ['p1', 'p2', 'p3', 'p4'],
  customers: [],
};

const office: UnitInspect = {
  kind: 'unit',
  id: 'u12',
  status: 'ok',
  type: 'office',
  name: null,
  level: 12,
  from: 40,
  to: 48,
  details: lease,
  upgrades: [],
};

const condoDetails: Condo = {
  group: 'condo',
  state: 'sold',
  residents: ['p7', 'p8'],
  residentCount: 2,
  capacity: 3,
  evaluation: 'good',
  price: 200_000,
  appraisal: 200_000,
  priceBand: 'normal',
  priceMin: 50_000,
  priceMax: 400_000,
  priceStep: 1,
  occupantScore: 3,
  listed: true,
  nextEvaluationStep: stepOfDate({ year: 1, month: 1, day: 8, hour: 0 }),
};

const hotelDetails: Hotel = {
  group: 'hotel',
  state: 'clean',
  guests: 0,
  tenants: [],
  capacity: 2,
  evaluation: null,
  price: 100,
  appraisal: 100,
  priceBand: 'normal',
  priceMin: 20,
  priceMax: 300,
  priceStep: 1,
  occupantScore: 3,
  checkoutStep: null,
};

describe('unit window model', () => {
  it('labels levels', () => {
    expect([levelText(12), levelText(-2), levelText(102)]).toEqual(['Piso 12', 'S2', 'Catedral']);
  });

  it('titles with the custom name, or the type and level', () => {
    expect(unitTitle(office)).toBe('Oficina · Piso 12');
    expect(unitTitle({ ...office, name: 'Mi estudio' })).toBe('Mi estudio');
  });

  it('shows only the floor, never the columns', () => {
    expect(locationText(office)).toBe('Piso 12');
  });

  it('keeps a typed or dragged price inside the limits and on the step', () => {
    expect(clampPrice(500, 2_000, 20_000, 1)).toBe(2_000);
    expect(clampPrice(99_999, 2_000, 20_000, 1)).toBe(20_000);
    expect(clampPrice(7_000.4, 2_000, 20_000, 1)).toBe(7_000);
    expect(clampPrice(7_004, 2_000, 20_000, 10)).toBe(7_000);
  });

  it('places the appraisal along the bar', () => {
    expect(appraisalPercent(11_000, 2_000, 20_000)).toBe(50);
    expect(appraisalPercent(1, 2_000, 20_000)).toBe(0);
    expect(appraisalPercent(30_000, 2_000, 20_000)).toBe(100);
    expect(appraisalPercent(5, 10, 10)).toBe(0);
  });

  it('reads the price control from the details, and none for a sold condo or a cinema', () => {
    expect(priceControlOf(office)).toEqual({
      price: 10_500,
      appraisal: 10_000,
      band: 'high',
      min: 2_000,
      max: 20_000,
      step: 1,
    });
    expect(priceBandLabel('low')).toBe('Bajo');
    expect(priceBandLabel('normal')).toBe('Normal');
    expect(priceBandLabel('high')).toBe('Alto');
    const condo: UnitInspect = { ...office, type: 'condo', details: condoDetails };
    expect(priceControlOf(condo)).toBeNull();
    const forSale = { ...condo, details: { ...condoDetails, state: 'forSale' as const } };
    expect(priceControlOf(forSale)).not.toBeNull();
    expect(
      priceControlOf({ details: { group: 'cinema', filmWeek: 1, filmAgeDays: 0 } }),
    ).toBeNull();
  });

  it('reads the builders priority of a site only', () => {
    expect(priorityOf({ details: { group: 'construction' } })).toBe(false);
    expect(priorityOf({ details: { group: 'construction', priority: true } })).toBe(true);
    expect(priorityOf(office)).toBeNull();
    expect(priorityOf({ details: null })).toBeNull();
  });

  it('reads whether a condo, office or shop is listed', () => {
    expect(listedOf(office)).toBe(true);
    expect(listedOf({ details: { ...lease, listed: false } })).toBe(false);
    expect(listedOf({ details: condoDetails })).toBe(true);
    expect(listedOf({ details: hotelDetails })).toBeNull();
    expect(listedOf({ details: null })).toBeNull();
  });

  it('keeps hours at least one hour apart', () => {
    expect(clampHours(8, 20, 'open')).toEqual({ open: 8, close: 20 });
    expect(clampHours(21, 20, 'open')).toEqual({ open: 19, close: 20 });
    expect(clampHours(8, 8, 'close')).toEqual({ open: 8, close: 9 });
    expect(clampHours(24, 24, 'open')).toEqual({ open: 23, close: 24 });
    expect(clampHours(0, 0, 'close')).toEqual({ open: 0, close: 1 });
  });

  it('groups the people of each unit type', () => {
    const ids = (unit: Parameters<typeof peopleGroups>[0]) =>
      peopleGroups(unit).map((group) => [group.id, group.people.length]);
    expect(ids(office)).toEqual([['workers', 4]]);
    expect(ids({ type: 'condo', details: condoDetails })).toEqual([['residents', 2]]);
    expect(ids({ type: 'suite', details: { ...hotelDetails, tenants: ['p1'] } })).toEqual([
      ['tenants', 1],
    ]);
    expect(
      ids({ type: 'retail-shop', details: { ...lease, workers: ['p1'], customers: ['p2', 'p3'] } }),
    ).toEqual([
      ['staff', 1],
      ['customers', 2],
    ]);
    expect(ids({ type: 'cinema', details: null })).toEqual([]);
    expect(ids({ type: 'recycling-center', details: null })).toEqual([]);
    expect(
      ids({
        type: 'housekeeping',
        details: {
          group: 'housekeeping',
          maidsWorking: 1,
          maids: 6,
          dirtyRooms: 0,
          workers: ['p1', 'p2'],
        },
      }),
    ).toEqual([['maids', 2]]);
    expect(ids({ type: 'security', details: { group: 'security', officers: ['p3'] } })).toEqual([
      ['officers', 1],
    ]);
    expect(
      ids({
        type: 'cinema',
        details: {
          group: 'cinema',
          filmWeek: 1,
          filmAgeDays: 0,
          workers: ['p4'],
          customers: ['p5', 'p6'],
        },
      }),
    ).toEqual([
      ['staff', 1],
      ['audience', 2],
    ]);
    expect(
      ids({ type: 'cathedral', details: { group: 'visit', workers: [], customers: ['p7'] } }),
    ).toEqual([
      ['staff', 0],
      ['customers', 1],
    ]);
    expect(
      peopleGroups({ type: 'security', details: { group: 'security', officers: [] } })[0],
    ).toMatchObject({
      label: 'Policías',
      kind: 'police',
    });
  });

  it('describes a leased office', () => {
    const rows = unitRows(office);
    expect(rows.map((row) => [row.label, row.value])).toEqual([
      ['Estado', 'Ocupada'],
      ['Evaluación', 'Regular'],
      ['Estrés de ocupantes', '3,0 / 10'],
      ['Renta semanal', '$10.500'],
    ]);
  });

  it('shows no appraisal for a rented shop and no contract chip', () => {
    const rows = unitRows({ ...office, type: 'retail-shop' });
    expect(rows.map((row) => row.label)).toEqual([
      'Estado',
      'Evaluación',
      'Estrés de ocupantes',
      'Próximo pago',
      'Renta semanal',
    ]);
  });

  it('lists the people groups of every unit with people, ready to show first', () => {
    const groups = (unit: Pick<UnitInspect, 'type' | 'details'>) =>
      peopleGroups(unit).map((group) => group.id);
    expect(groups(office)).toEqual(['workers']);
    expect(groups({ type: 'condo', details: condoDetails })).toEqual(['residents']);
    expect(groups({ type: 'suite', details: hotelDetails })).toEqual(['tenants']);
    expect(groups({ type: 'retail-shop', details: lease })).toEqual(['staff', 'customers']);
  });

  it('gives a priced construction site the price control and the listing switch', () => {
    const site: UnitInspect = {
      ...office,
      details: {
        group: 'construction',
        price: 9_000,
        appraisal: 10_000,
        priceBand: 'normal',
        priceMin: 4_000,
        priceMax: 25_000,
        priceStep: 1,
        listed: true,
      },
    };
    expect(priceControlOf(site)).toEqual({
      price: 9_000,
      appraisal: 10_000,
      band: 'normal',
      min: 4_000,
      max: 25_000,
      step: 1,
    });
    expect(listedOf(site)).toBe(true);
    const lift: UnitInspect = { ...office, type: 'security', details: { group: 'construction' } };
    expect(priceControlOf(lift)).toBeNull();
    expect(listedOf(lift)).toBeNull();
  });

  it('describes an office for rent without a contract', () => {
    const forRent: Lease = {
      ...lease,
      state: 'forRent',
      persons: 0,
      evaluation: null,
      nextPaymentStep: null,
      weeklyRent: null,
      workers: [],
    };
    expect(unitRows({ ...office, details: forRent }).map((row) => row.value)).toEqual([
      'En alquiler',
      'Sin evaluar',
      '3,0 / 10',
    ]);
  });

  it('shows no status tile, no next evaluation and the appraisal for a condo', () => {
    const condo: UnitInspect = { ...office, type: 'condo', details: condoDetails };
    expect(isSoldCondo(condo)).toBe(true);
    // People are listed in the row at the top, never counted in a tile.
    expect(unitRows(condo).map((row) => row.id)).toEqual([
      'evaluation',
      'occupantStress',
      'appraisal',
    ]);
    const forSale: UnitInspect = { ...condo, details: { ...condoDetails, state: 'forSale' } };
    expect(isSoldCondo(forSale)).toBe(false);
    expect(unitRows(forSale).map((row) => row.id)).toEqual([
      'evaluation',
      'occupantStress',
      'appraisal',
    ]);
    expect(unitRows(forSale).map((row) => row.label)).not.toContain('Próxima evaluación');
  });

  it('reads a hotel room state from the server', () => {
    const state = (value: Hotel['state']) =>
      unitRows({ ...office, type: 'double-room', details: { ...hotelDetails, state: value } })[0]
        ?.value;
    expect(state('clean')).toBe('Libre');
    expect(state('dirty')).toBe('Sucia');
    expect(state('infested')).toBe('Con plaga');
    expect(state('occupied')).toBe('Ocupada');
  });

  it('never shows the check-out time, even while a guest stays', () => {
    const occupied: Hotel = {
      ...hotelDetails,
      state: 'occupied',
      guests: 1,
      checkoutStep: stepOfDate({ year: 1, month: 1, day: 3, hour: 10 }),
    };
    const room: UnitInspect = { ...office, type: 'suite', details: occupied };
    expect(unitRows(room).map((row) => row.id)).toEqual(['status', 'evaluation', 'occupantStress']);
  });

  it('shows the film week and day of a cinema', () => {
    const cinema: UnitInspect = {
      ...office,
      type: 'cinema',
      details: { group: 'cinema', filmWeek: 3, filmAgeDays: 15 },
    };
    expect(unitRows(cinema)).toEqual([
      { id: 'film', label: 'Película', value: 'Semana 3 (día 15)', tone: 'plain' },
    ]);
  });

  it('shows the dirty rooms of a housekeeping unit and no count of maids', () => {
    const housekeeping: UnitInspect = {
      ...office,
      type: 'housekeeping',
      details: { group: 'housekeeping', maidsWorking: 4, maids: 6, dirtyRooms: 11 },
    };
    expect(unitRows(housekeeping)).toEqual([
      { id: 'dirtyRooms', label: 'Habitaciones sucias en la torre', value: '11', tone: 'plain' },
    ]);
    expect(priceControlOf(housekeeping)).toBeNull();
  });

  it('shows no film row while the film is unknown', () => {
    const cinema: UnitInspect = {
      ...office,
      type: 'cinema',
      details: { group: 'cinema', filmWeek: null, filmAgeDays: null },
    };
    expect(unitRows(cinema)).toEqual([]);
  });

  it('shows served, result and hours of a fast food and no count of people inside, and charts both lines', () => {
    const venue = {
      group: 'venue',
      served: 30,
      inside: 4,
      workers: ['p1'],
      workersInside: 1,
      customers: ['p2', 'p3', 'p4'],
      opens: 8,
      closes: 20,
      hours: { open: 8, close: 20 },
      enabled: true,
      activeToday: true,
      resultToday: -3_000,
      today: [0, 10],
      average: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 20],
    } as const;
    const food: UnitInspect = { ...office, type: 'fast-food', details: venue };
    expect(unitRows(food)).toEqual([
      { id: 'served', label: 'Atendidos', value: '30', tone: 'plain' },
      { id: 'result', label: 'Resultado', value: '-$3.000', tone: 'bad' },
    ]);
    const shop: UnitInspect = { ...food, type: 'restaurant' };
    expect(unitRows(shop).at(-1)).toMatchObject({ id: 'hours', value: '08:00 a 20:00' });
    expect(groupUnitRows(unitRows(food)).tiles).toHaveLength(2);

    const chart = venueChart(venue);
    expect(chart.max).toBe(20);
    // The chart spans the day: 08:30 is at 56.7 of 160, 09:30 at 63.3.
    expect(chart.today).toBe('56.7,48 63.3,24');
    expect(chart.average.split(' ')).toHaveLength(12);
    expect(chart.average.endsWith('130,0')).toBe(true);
    expect([chart.from, chart.to]).toEqual(['00:00', '24:00']);
    // Closed before 08:00 and from 20:00.
    expect(chart.closed).toEqual([
      { x: 0, width: 53.3 },
      { x: 133.3, width: 26.7 },
    ]);
    expect(chart.pointX).toHaveLength(12);
    expect(venueChart({ ...venue, today: [], average: [] })).toMatchObject({
      today: '',
      average: '',
    });
  });

  it('has no rows or price for a type without details', () => {
    expect(unitRows({ ...office, type: 'cinema', details: null })).toEqual([]);
    expect(priceControlOf({ details: null })).toBeNull();
  });

  it('colors the evaluation like the overlay', () => {
    expect(evaluationView('good').color).toBe('sky-deep');
    expect(evaluationView('poor').color).toBe('cloth-red');
    expect(evaluationView(null)).toEqual({ label: 'Sin evaluar', color: 'gray' });
  });

  it('writes the type and level in the subtitle', () => {
    expect(unitSubtitle(office)).toBe('Oficina · Piso 12');
  });

  it('groups state and evaluation as tiles and the shop payment as a chip', () => {
    const groups = groupUnitRows(unitRows({ ...office, type: 'retail-shop' }));
    expect(groups.tiles.map((row) => row.id)).toEqual(['status', 'evaluation']);
    expect(groups.chips.map((row) => row.id)).toEqual(['nextPayment']);
    expect(groups.rows.map((row) => row.id)).toEqual(['occupantStress', 'weeklyRent']);
    const cinema = groupUnitRows([{ id: 'film', label: 'Película', value: 'x', tone: 'plain' }]);
    expect(cinema.rows.map((row) => row.id)).toEqual(['film']);
  });

  it('tones the state and evaluation tiles', () => {
    const [status, evaluation] = unitRows(office);
    expect(status?.tone).toBe('good');
    expect(evaluation?.tone).toBe('warn');
    const forRent: Lease = { ...lease, state: 'forRent', evaluation: 'good' };
    const [vacant, good] = unitRows({ ...office, details: forRent });
    expect([vacant?.tone, good?.tone]).toEqual(['plain', 'good']);
    const poor: Lease = { ...lease, evaluation: 'poor' };
    expect(unitRows({ ...office, details: poor })[1]?.tone).toBe('bad');
  });

  it('disables the film change under $300.000, with a reason', () => {
    expect(filmChangeState(299_999, false)).toEqual({
      disabled: true,
      tooltip: 'No alcanza el dinero.',
    });
    expect(filmChangeState(300_000, false)).toEqual({ disabled: false, tooltip: undefined });
    expect(filmChangeState(1_000_000, true).disabled).toBe(true);
  });

  it('lists upgrades with level, price and what cannot be bought', () => {
    const upgrades: UnitInspect['upgrades'] = [
      { id: 'cameras', level: 1, maxLevel: 3, nextPrice: 50_000 },
      { id: 'accessControl', level: 2, maxLevel: 2, nextPrice: null },
    ];
    const rows = upgradeRows({ upgrades }, 49_999, false);
    expect(rows.map((row) => [row.id, row.label, row.levelText, row.disabled])).toEqual([
      ['cameras', 'Cámaras', '1/3', true],
      ['accessControl', 'Control de acceso', '2/2', true],
    ]);
    expect(rows[0]?.tooltip).toBeDefined();
    expect(rows[1]?.priceText).toBeNull();
    expect(upgradeRows({ upgrades }, 50_000, false)[0]?.disabled).toBe(false);
    expect(upgradeRows({ upgrades }, 50_000, true)[0]?.disabled).toBe(true);
    expect(upgradeRows(office, 0, false)).toEqual([]);
  });
});

describe('evaluation reasons of an office', () => {
  const parts = {
    occupantScore: 2,
    fairPrice: 10_500,
    noisy: false,
    mainCause: null,
    neighborPull: false,
  } as const;
  const officeWith = (patch: Partial<NonNullable<Lease['evaluationParts']>> | null) =>
    ({
      details:
        patch === null
          ? { ...lease, evaluationParts: undefined }
          : { ...lease, evaluationParts: { ...parts, ...patch } },
    }) as Pick<UnitInspect, 'details'>;

  it('has no reasons for a unit without parts, such as a shop', () => {
    expect(evaluationReasons(officeWith(null))).toBeNull();
  });

  it('lists a fair rent, calm workers and a quiet floor in favor', () => {
    expect(evaluationReasons(officeWith({}))).toEqual({
      good: ['Alquiler dentro del precio justo', 'Trabajadores tranquilos', 'Sin ruido cerca'],
      bad: [],
    });
  });

  it('lists a rent over the fair price, stressed workers, noise and a bad neighbor against', () => {
    expect(
      evaluationReasons(
        officeWith({
          fairPrice: 10_499,
          occupantScore: 3,
          mainCause: 'wait',
          noisy: true,
          neighborPull: true,
        }),
      ),
    ).toEqual({
      good: [],
      bad: [
        'Alquiler por encima del precio justo',
        'Trabajadores estresados por esperas del ascensor',
        'Ruido cerca',
        'Vecino mal valorado',
      ],
    });
  });
});

describe('occupant stress row', () => {
  it('shows the occupants score out of 10 with one decimal, for offices, condos and rooms', () => {
    const row = (details: Details) =>
      unitRows({ ...office, details }).find((r) => r.id === 'occupantStress');
    expect(row({ ...lease, occupantScore: 3.44 })?.value).toBe('3,4 / 10');
    expect(row({ ...lease, occupantScore: 3.44 })?.label).toBe('Estrés de ocupantes');
    expect(row({ ...condoDetails, occupantScore: 0 })?.value).toBe('0,0 / 10');
    expect(row({ ...hotelDetails, occupantScore: 9.96 })?.value).toBe('10,0 / 10');
  });
});
