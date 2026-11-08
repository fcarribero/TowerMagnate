import type { TowerResetRequest } from '@tower-magnate/shared';

export const TOWER_PATHS = {
  reset: '/api/tower/reset',
} as const;

type Fetch = typeof fetch;

export interface TowerApi {
  /** Resolves true when the server demolished the tower and started a new one. */
  resetTower(): Promise<boolean>;
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
  };
}
