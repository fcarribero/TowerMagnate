import { PLAY_TOKEN_HEADER, TOWER_STATE_PATH } from '@tower-magnate/shared';
import { describe, expect, it, vi } from 'vitest';
import { uploadState } from './stateUploader';

const body = new Uint8Array([1, 2, 3]);
const reply = (status: number) => vi.fn(async () => new Response(null, { status })) as unknown as typeof fetch;

describe('uploadState', () => {
  it('sends a PUT with the token and reports saved on 204', async () => {
    const f = reply(204);
    expect(await uploadState(body, 'tok', f)).toBe('saved');
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(TOWER_STATE_PATH);
    expect(init.method).toBe('PUT');
    expect(init.body).toBe(body);
    expect(init.credentials).toBe('same-origin');
    expect(init.headers).toEqual({
      'Content-Type': 'application/octet-stream',
      [PLAY_TOKEN_HEADER]: 'tok',
    });
  });
  it('reports stale on 409', async () => {
    expect(await uploadState(body, 't', reply(409))).toBe('stale');
  });
  it('reports unauthenticated on 401', async () => {
    expect(await uploadState(body, 't', reply(401))).toBe('unauthenticated');
  });
  it('reports failed on 500', async () => {
    expect(await uploadState(body, 't', reply(500))).toBe('failed');
  });
  it('reports failed when fetch throws', async () => {
    const f = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(await uploadState(body, 't', f)).toBe('failed');
  });
});
