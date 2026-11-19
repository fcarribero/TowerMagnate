import { PLAY_TOKEN_HEADER, TOWER_STATE_PATH } from '@tower-magnate/shared';

export type UploadOutcome = 'saved' | 'failed' | 'stale';

/** PUT the gzipped state. 204 is saved, 409 means another tab took over. */
export async function uploadState(
  body: Uint8Array,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<UploadOutcome> {
  try {
    const res = await fetchImpl(TOWER_STATE_PATH, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream', [PLAY_TOKEN_HEADER]: token },
      body: body as BodyInit,
      credentials: 'same-origin',
    });
    if (res.status === 204) return 'saved';
    if (res.status === 409) return 'stale';
    return 'failed';
  } catch {
    return 'failed';
  }
}
