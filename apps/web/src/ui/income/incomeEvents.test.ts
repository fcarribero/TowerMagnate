import type { ClientEvent } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { incomeFloaters, type FloaterSpace } from './incomeEvents';

const OFFICE = 'unit-1';

function income(amount: number, unitId: string | null): ClientEvent {
  return { type: 'moneyChanged', step: 1, amount, reason: 'rent', unitId } as ClientEvent;
}

const space: FloaterSpace = {
  unitRect: (id) => (id === OFFICE ? { x: 100, y: 200, width: 40, height: 20 } : null),
  cssPerDevicePixel: 0.5,
  canvasOrigin: { x: 10, y: 5 },
};

describe('incomeFloaters', () => {
  it('shows the amount over the top centre of a visible unit', () => {
    expect(incomeFloaters([income(25000, OFFICE)], space)).toEqual([
      { text: '+$25.000', negative: false, x: 10 + 120 * 0.5, y: 5 + 100 },
    ]);
  });

  it('skips a unit that is off screen', () => {
    expect(incomeFloaters([income(25000, 'unit-9')], space)).toEqual([]);
  });

  it('skips money without a unit and zero amounts', () => {
    const events = [income(500, null), income(0, OFFICE), income(-300, null)];
    expect(incomeFloaters(events, space)).toEqual([]);
  });

  it('shows money spent or lost as a negative amount', () => {
    expect(incomeFloaters([income(-40000, OFFICE)], space)).toEqual([
      { text: '-$40.000', negative: true, x: 10 + 120 * 0.5, y: 5 + 100 },
    ]);
  });

  it('shows one floater per income', () => {
    expect(incomeFloaters([income(100, OFFICE), income(200, OFFICE)], space)).toHaveLength(2);
  });
});
