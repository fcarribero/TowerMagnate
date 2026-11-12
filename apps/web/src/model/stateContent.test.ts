import { serverMessage } from '@tower-magnate/shared';
import { describe, expect, it, vi } from 'vitest';
import { MAP_COLORS, paintTowerMap, mapRowTop, MAP_WIDTH } from '../render/towerMap';
import { levelToIndex } from '../render/levels';
import { delta, office, shaft, snapshot } from '../testing/protocolFixtures';
import { ClientStore } from './clientStore';
import { stateFromSnapshot } from './gameState';
import { bindTowerContent, contentFromState } from './stateContent';
import { TowerContentStore } from './towerContent';

function colorAt(pixels: Uint8ClampedArray, x: number, level: number): number {
  const offset = (mapRowTop(levelToIndex(level)) * MAP_WIDTH + x) * 4;
  return (
    ((pixels[offset] ?? 0) << 16) | ((pixels[offset + 1] ?? 0) << 8) | (pixels[offset + 2] ?? 0)
  );
}

describe('contentFromState', () => {
  const content = contentFromState(stateFromSnapshot(snapshot));

  it('carries the structure rows', () => {
    expect(content.levels[1]?.structure).toBe('l'.repeat(375));
  });

  it('lists units, transports and shafts', () => {
    expect(content.units.map((unit) => unit.id).sort()).toEqual(['s4', 't3', 'u12']);
  });

  it('gives a shaft the height between its bottom and top', () => {
    const elevator = content.units.find((unit) => unit.id === 's4');
    expect(elevator).toMatchObject({ type: 'standard-elevator', level: 1, floors: 5 });
  });
});

describe('bindTowerContent', () => {
  function bound() {
    const store = new ClientStore({ requestResync: vi.fn() });
    const content = new TowerContentStore();
    bindTowerContent(store, content);
    store.receive(serverMessage('snapshot', snapshot));
    return { store, content };
  }

  it('draws the player unit on the map, not a stand-in', () => {
    const { content } = bound();
    const pixels = paintTowerMap(content.content);
    expect(colorAt(pixels, office.x, office.level)).toBe(MAP_COLORS.officesAndHousing);
    expect(colorAt(pixels, shaft.x, 3)).toBe(MAP_COLORS.transport);
  });

  it('drops a demolished unit and shows a new one after deltas', () => {
    const { store, content } = bound();
    store.receive(
      serverMessage(
        'delta',
        delta({
          step: 101,
          unitsRemoved: [office.id],
          unitsUpserted: [{ ...office, id: 'u13', x: 200, level: 7 }],
        }),
      ),
    );
    const pixels = paintTowerMap(content.content);
    expect(colorAt(pixels, office.x, office.level)).not.toBe(MAP_COLORS.officesAndHousing);
    expect(colorAt(pixels, 200, 7)).toBe(MAP_COLORS.officesAndHousing);
  });
});
