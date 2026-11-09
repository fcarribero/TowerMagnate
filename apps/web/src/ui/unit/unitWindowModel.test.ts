import { stepOfDate } from '@tower-magnate/engine/calendar';
import { describe, expect, it } from 'vitest';
import type { UnitInspect } from '../../model/inspectStore';
import {
  evaluationView,
  filmChangeState,
  levelText,
  locationText,
  isSoldCondo,
  priceOf,
  priceOptions,
  unitRows,
  unitTitle,
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
  price: 'normal',
  leaseWeek: 2,
  nextPaymentStep: stepOfDate({ year: 1, month: 1, day: 5, hour: 9 }),
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
};

const condoDetails: Condo = {
  group: 'condo',
  state: 'sold',
  residents: 2,
  capacity: 3,
  evaluation: 'good',
  price: 'normal',
  nextEvaluationStep: stepOfDate({ year: 1, month: 1, day: 8, hour: 0 }),
};

const hotelDetails: Hotel = {
  group: 'hotel',
  state: 'clean',
  guests: 0,
  capacity: 2,
  evaluation: null,
  price: 'normal',
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

  it('shows the cells the unit covers', () => {
    expect(locationText(office)).toBe('Piso 12, casilleros 40 a 48');
  });

  it('lists the four prices with their amounts', () => {
    expect(priceOptions('office').map((option) => option.label)).toEqual([
      'Alto $15.000',
      'Normal $10.000',
      'Bajo $5.000',
      'Mínimo $2.000',
    ]);
    expect(priceOptions('cinema')).toEqual([]);
  });

  it('describes a leased office', () => {
    const rows = unitRows(office);
    expect(rows.map((row) => [row.label, row.value])).toEqual([
      ['Estado', 'Ocupada'],
      ['Personas', '4 de 6'],
      ['Evaluación', 'Regular'],
      ['Contrato', 'Semana 2 de 4'],
      ['Próximo pago', 'Viernes 09:00'],
    ]);
  });

  it('describes an office for rent without a contract', () => {
    const forRent: Lease = {
      ...lease,
      state: 'forRent',
      persons: 0,
      evaluation: null,
      leaseWeek: null,
      nextPaymentStep: null,
    };
    expect(unitRows({ ...office, details: forRent }).map((row) => row.value)).toEqual([
      'En alquiler',
      '0 de 6',
      'Sin evaluar',
      'Sin contrato',
    ]);
  });

  it('shows the next evaluation only for a sold condo', () => {
    const condo: UnitInspect = { ...office, type: 'condo', details: condoDetails };
    expect(unitRows(condo).at(-1)?.value).toBe('Lunes 8 de enero');
    expect(isSoldCondo(condo)).toBe(true);
    const forSale: UnitInspect = {
      ...condo,
      details: { ...condoDetails, state: 'forSale', nextEvaluationStep: null },
    };
    expect(isSoldCondo(forSale)).toBe(false);
    expect(unitRows(forSale).map((row) => row.id)).toEqual(['status', 'residents', 'evaluation']);
    expect(unitRows(forSale)[0]?.value).toBe('En venta');
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

  it('shows the checkout only while a guest stays', () => {
    const occupied: Hotel = {
      ...hotelDetails,
      state: 'occupied',
      guests: 1,
      checkoutStep: stepOfDate({ year: 1, month: 1, day: 3, hour: 10 }),
    };
    const room: UnitInspect = { ...office, type: 'suite', details: occupied };
    expect(unitRows(room).at(-1)).toMatchObject({ label: 'Salida', value: 'Miércoles 10:00' });
    const vacant: UnitInspect = { ...room, details: { ...occupied, state: 'clean', guests: 0 } };
    expect(unitRows(vacant).map((row) => row.id)).not.toContain('checkout');
  });

  it('shows the film week and day of a cinema', () => {
    const cinema: UnitInspect = {
      ...office,
      type: 'cinema',
      details: { group: 'cinema', filmWeek: 3, filmAgeDays: 15, price: 'normal' },
    };
    expect(unitRows(cinema)).toEqual([
      { id: 'film', label: 'Película', value: 'Semana 3 (día 15)' },
    ]);
  });

  it('shows the working maids and the dirty rooms of a housekeeping unit', () => {
    const housekeeping: UnitInspect = {
      ...office,
      type: 'housekeeping',
      details: { group: 'housekeeping', maidsWorking: 4, maids: 6, dirtyRooms: 11 },
    };
    expect(unitRows(housekeeping)).toEqual([
      { id: 'maidsWorking', label: 'Mucamas trabajando', value: '4 de 6' },
      { id: 'dirtyRooms', label: 'Habitaciones sucias en la torre', value: '11' },
    ]);
  });

  it('shows no film row while the film is unknown', () => {
    const cinema: UnitInspect = {
      ...office,
      type: 'cinema',
      details: { group: 'cinema', filmWeek: null, filmAgeDays: null, price: 'normal' },
    };
    expect(unitRows(cinema)).toEqual([]);
  });

  it('has no rows or price for a type without details', () => {
    expect(unitRows({ ...office, type: 'fast-food', details: null })).toEqual([]);
    expect(priceOf({ details: null })).toBeNull();
    expect(priceOf(office)).toBe('normal');
  });

  it('colors the evaluation like the overlay', () => {
    expect(evaluationView('good').color).toBe('sky-deep');
    expect(evaluationView('poor').color).toBe('cloth-red');
    expect(evaluationView(null)).toEqual({ label: 'Sin evaluar', color: 'gray' });
  });

  it('disables the film change under $300.000, with a reason', () => {
    expect(filmChangeState(299_999, false)).toEqual({
      disabled: true,
      tooltip: 'No alcanza el dinero.',
    });
    expect(filmChangeState(300_000, false)).toEqual({ disabled: false, tooltip: undefined });
    expect(filmChangeState(1_000_000, true).disabled).toBe(true);
  });
});
