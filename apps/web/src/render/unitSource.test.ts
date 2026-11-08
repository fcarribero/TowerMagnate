import { describe, expect, it } from 'vitest';
import { ClientStore } from '../model/clientStore';
import { delta, office, snapshot } from '../testing/protocolFixtures';
import type { UnitsInput } from './unitLayer';
import { bindUnits, debugUnits, testUnitsFromQuery } from './unitSource';

describe('bindUnits', () => {
  it('shows the snapshot units and again when a delta changes a variant', () => {
    const store = new ClientStore({ requestResync: () => {} });
    store.applySnapshot(snapshot);
    const shown: UnitsInput[] = [];
    bindUnits(store, (input) => shown.push(input));
    expect(shown).toHaveLength(1);
    expect([...(shown[0]?.units ?? [])].map((unit) => unit.id)).toContain('u12');

    store.applyDelta(
      delta({
        step: snapshot.step + 1,
        unitsUpserted: [{ ...office, occupied: false, variant: 'empty' }],
      }),
    );
    expect(shown).toHaveLength(2);
    expect([...(shown[1]?.units ?? [])][0]?.variant).toBe('empty');
  });
});

describe('debugUnits', () => {
  it('has every placed unit type empty and occupied', () => {
    const { units, transports } = debugUnits(12);
    expect(units).toHaveLength(36);
    expect(units.filter((unit) => unit.occupied)).toHaveLength(18);
    expect(transports.map((transport) => transport.type)).toEqual(['stairs', 'escalator']);
  });

  it('follows the hour', () => {
    expect(debugUnits(12).time).toBe('day');
    expect(debugUnits(23).time).toBe('night');
  });
});

describe('testUnitsFromQuery', () => {
  it('reads an hour from 0 to 23', () => {
    expect(testUnitsFromQuery('?testUnits=21')).toBe(21);
    expect(testUnitsFromQuery('?testUnits=24')).toBeNull();
    expect(testUnitsFromQuery('')).toBeNull();
  });
});
