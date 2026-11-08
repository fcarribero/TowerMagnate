import { stepOfDate } from '@tower-magnate/engine/calendar';
import { describe, expect, it } from 'vitest';
import type { UnitInspect } from '../../model/inspectStore';
import {
  evaluationView,
  filmChangeState,
  levelText,
  locationText,
  priceOptions,
  unitRows,
  unitTitle,
} from './unitWindowModel';

const office: UnitInspect = {
  kind: 'unit',
  id: 'u12',
  type: 'office',
  name: null,
  level: 12,
  x: 40,
  occupants: 4,
  capacity: 6,
  evaluation: 'fair',
  price: 'normal',
  contract: {
    state: 'leased',
    week: 2,
    nextPaymentStep: stepOfDate({ year: 1, month: 1, day: 5, hour: 9 }),
  },
  hotelStayEndStep: null,
  filmAgeDays: null,
};

const noContext = { variant: undefined };

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
    const rows = unitRows(office, noContext);
    expect(rows.map((row) => [row.label, row.value])).toEqual([
      ['Estado', 'Ocupada'],
      ['Personas', '4 de 6'],
      ['Evaluación', 'Regular'],
      ['Contrato', 'Semana 2 de 4'],
      ['Próximo pago', 'Viernes 09:00'],
    ]);
  });

  it('describes an office for rent without a contract', () => {
    const rows = unitRows(
      {
        ...office,
        occupants: 0,
        evaluation: null,
        contract: { state: 'forLease', week: null, nextPaymentStep: null },
      },
      noContext,
    );
    expect(rows.map((row) => row.value)).toEqual([
      'En alquiler',
      '0 de 6',
      'Sin evaluar',
      'Sin contrato',
    ]);
  });

  it('shows the next evaluation only for a sold condo', () => {
    const condo: UnitInspect = {
      ...office,
      type: 'condo',
      capacity: 3,
      occupants: 2,
      contract: {
        state: 'sold',
        week: null,
        nextPaymentStep: stepOfDate({ year: 1, month: 1, day: 8, hour: 0 }),
      },
    };
    const sold = unitRows(condo, noContext);
    expect(sold.at(-1)?.value).toBe('Lunes 8 de enero');
    const forSale = unitRows(
      { ...condo, contract: { state: 'forSale', week: null, nextPaymentStep: null } },
      noContext,
    );
    expect(forSale.map((row) => row.id)).toEqual(['status', 'residents', 'evaluation']);
    expect(forSale[0]?.value).toBe('En venta');
  });

  it('reads a hotel room state from occupancy and the drawn variant', () => {
    const room: UnitInspect = {
      ...office,
      type: 'double-room',
      occupants: 0,
      capacity: 2,
      contract: null,
    };
    const state = (variant: string | undefined, occupants = 0) =>
      unitRows({ ...room, occupants }, { variant })[0]?.value;
    expect(state('empty')).toBe('Libre');
    expect(state('dirty')).toBe('Sucia');
    expect(state('infested')).toBe('Con plaga');
    expect(state('occupied', 2)).toBe('Ocupada');
  });

  it('shows the checkout only while a guest stays', () => {
    const room: UnitInspect = {
      ...office,
      type: 'suite',
      occupants: 1,
      capacity: 2,
      contract: null,
      hotelStayEndStep: stepOfDate({ year: 1, month: 1, day: 3, hour: 10 }),
    };
    expect(unitRows(room, noContext).at(-1)).toMatchObject({
      label: 'Salida',
      value: 'Miércoles 10:00',
    });
    expect(unitRows({ ...room, occupants: 0 }, noContext).map((row) => row.id)).not.toContain(
      'checkout',
    );
  });

  it('shows the film week and day of a cinema', () => {
    const cinema: UnitInspect = { ...office, type: 'cinema', filmAgeDays: 15, contract: null };
    expect(unitRows(cinema, noContext)).toEqual([
      { id: 'film', label: 'Película', value: 'Semana 3 (día 15)' },
    ]);
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
