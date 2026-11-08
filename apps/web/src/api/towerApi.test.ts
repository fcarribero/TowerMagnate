import { describe, expect, it, vi } from 'vitest';
import { TOWER_PATHS, createTowerApi } from './towerApi';

function apiAnswering(result: Response | Error) {
  const fetchImpl = vi.fn(async () => {
    if (result instanceof Error) {
      throw result;
    }
    return result;
  });
  return { api: createTowerApi(fetchImpl as unknown as typeof fetch), fetchImpl };
}

describe('createTowerApi', () => {
  it('posts the confirmation and reports success', async () => {
    const { api, fetchImpl } = apiAnswering(new Response('{}', { status: 200 }));
    expect(await api.resetTower()).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      TOWER_PATHS.reset,
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ confirm: true }) }),
    );
  });

  it('reports a server refusal', async () => {
    const { api } = apiAnswering(new Response('{}', { status: 404 }));
    expect(await api.resetTower()).toBe(false);
  });

  it('reports a network failure', async () => {
    const { api } = apiAnswering(new TypeError('offline'));
    expect(await api.resetTower()).toBe(false);
  });
});
