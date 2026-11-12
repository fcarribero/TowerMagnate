import { SHAFT_UNIT_TYPES } from '@tower-magnate/shared';
import type { ClientStore } from './clientStore';
import type { GameState } from './gameState';
import type { ContentSnapshot, ContentUnit, TowerContentStore } from './towerContent';

type ContentParts = Pick<GameState, 'structure' | 'units' | 'transports' | 'shafts'>;

export function contentFromState(state: ContentParts): ContentSnapshot {
  const levels: ContentSnapshot['levels'] = {};
  for (const [level, structure] of state.structure) {
    levels[level] = { structure };
  }
  const units: ContentUnit[] = [
    ...[...state.units.values()].map(({ id, type, x, level }) => ({ id, type, x, level })),
    ...[...state.transports.values()].map(({ id, type, x, level }) => ({ id, type, x, level })),
    ...[...state.shafts.values()].map((shaft) => ({
      id: shaft.id,
      type: SHAFT_UNIT_TYPES[shaft.type],
      x: shaft.x,
      level: shaft.bottom,
      floors: shaft.top - shaft.bottom + 1,
    })),
  ];
  return { levels, units };
}

/** Keeps `content` equal to the built cells in the store. Returns the unbind function. */
export function bindTowerContent(store: ClientStore, content: TowerContentStore): () => void {
  return store.select(
    ({ structure, units, transports, shafts }) => ({ structure, units, transports, shafts }),
    (parts) => content.applySnapshot(contentFromState(parts)),
  );
}
