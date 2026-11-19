import { TOWER_PLAY_PATH, type PlayResponse, type TowerResetRequest } from '@tower-magnate/shared';

export const TOWER_PATHS = {
  reset: '/api/tower/reset',
  play: TOWER_PLAY_PATH,
} as const;

type Fetch = typeof fetch;

export interface TowerApi {
  /** Resolves true when the server demolished the tower and started a new one. */
  resetTower(): Promise<boolean>;
  /** Starts a play session: the token for saves and the latest saved state. Null on any failure. */
  play(): Promise<PlayResponse | null>;
}

export function createTowerApi(fetchImpl: Fetch = (input, init) => fetch(input, init)): TowerApi {
  return {
    async resetTower() {
      const body: TowerResetRequest = { confirm: true };
      try {
        const response = await fetchImpl(TOWER_PATHS.reset, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(body),
        });
        return response.ok;
      } catch {
        return false;
      }
    },
    async play() {
      try {
        const response = await fetchImpl(TOWER_PATHS.play, {
          method: 'POST',
          credentials: 'same-origin',
        });
        if (response.status !== 200) return null;
        return (await response.json()) as PlayResponse;
      } catch {
        return null;
      }
    },
  };
}
