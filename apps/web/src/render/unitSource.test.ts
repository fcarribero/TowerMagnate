import { describe, expect, it } from 'vitest';
import { ClientStore } from '../model/clientStore';
import { delta, office, snapshot } from '../testing/protocolFixtures';
import type { UnitsInput } from './unitLayer';
import {
  DEBUG_VARIANT_LEVEL,
  bindUnits,
  debugStructure,
  debugUnits,
  testUnitsFromQuery,
} from './unitSource';

describe('bindUnits', () => {
  it('shows the snapshot units and again when a delta changes a variant', () => {
    const store = new ClientStore({ requestResync: () => {} });
    store.applySnapshot(snapshot);
    const shown: UnitsInput[] = [];
    bindUnits(store, 'normal', (input) => shown.push(input));
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
    expect(units.filter((unit) => unit.variant === 'empty')).toHaveLength(18);
    expect(units.filter((unit) => unit.occupied)).toHaveLength(18);
    expect(transports.map((transport) => transport.type)).toEqual(['stairs', 'escalator']);
  });

  it('has the stage 2 variants and ruins', () => {
    const { units } = debugUnits(12);
    const variants = units.map((unit) => `${unit.type}:${unit.variant}`);
    expect(variants).toContain('single-room:dirty');
    expect(variants).toContain('suite:infested');
    expect(variants).toContain('parking-space:disconnected');
    const ruins = debugStructure().structure.get(DEBUG_VARIANT_LEVEL);
    expect(ruins).toContain('r');
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
