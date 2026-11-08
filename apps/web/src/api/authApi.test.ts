import { describe, expect, it, vi } from 'vitest';
import { AUTH_PATHS, createAuthApi } from './authApi';

const user = { id: 7, username: 'ana_42' };
const credentials = { username: 'ana_42', password: 'secreto123' };

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function apiAnswering(response: Response | Error) {
  const fetchImpl = vi.fn(async () => {
    if (response instanceof Error) {
      throw response;
    }
    return response;
  });
  return { api: createAuthApi(fetchImpl as unknown as typeof fetch), fetchImpl };
}

describe('createAuthApi', () => {
  it('posts the credentials as JSON and returns the user', async () => {
    const { api, fetchImpl } = apiAnswering(jsonResponse(200, { user }));
    expect(await api.login(credentials)).toEqual({ ok: true, user });
    expect(fetchImpl).toHaveBeenCalledWith(
      AUTH_PATHS.login,
      expect.objectContaining({ method: 'POST', body: JSON.stringify(credentials) }),
    );
  });

  it('registers on the register route', async () => {
    const { api, fetchImpl } = apiAnswering(jsonResponse(201, { user }));
    expect(await api.register(credentials)).toEqual({ ok: true, user });
    expect(fetchImpl).toHaveBeenCalledWith(AUTH_PATHS.register, expect.anything());
  });

  it('reads 409 as a taken username and 401 as wrong credentials', async () => {
    expect(await apiAnswering(jsonResponse(409, { error: 'x' })).api.register(credentials)).toEqual(
      {
        ok: false,
        reason: 'usernameTaken',
      },
    );
    expect(await apiAnswering(jsonResponse(401, { error: 'x' })).api.login(credentials)).toEqual({
      ok: false,
      reason: 'wrongCredentials',
    });
  });

  it('passes on the server message of a 400', async () => {
    const { api } = apiAnswering(jsonResponse(400, { error: 'La contraseña es obligatoria.' }));
    expect(await api.login(credentials)).toEqual({
      ok: false,
      reason: 'rejected',
      message: 'La contraseña es obligatoria.',
    });
  });

  it('reports a network failure and a server error the same way', async () => {
    expect(await apiAnswering(new TypeError('offline')).api.login(credentials)).toEqual({
      ok: false,
      reason: 'network',
    });
    expect(await apiAnswering(jsonResponse(500)).api.login(credentials)).toEqual({
      ok: false,
      reason: 'network',
    });
  });

  it('tells signed in, signed out and unreachable apart', async () => {
    expect(await apiAnswering(jsonResponse(200, { user })).api.currentUser()).toEqual({
      status: 'signedIn',
      user,
    });
    expect(await apiAnswering(jsonResponse(401, { error: 'x' })).api.currentUser()).toEqual({
      status: 'signedOut',
    });
    expect(await apiAnswering(new TypeError('offline')).api.currentUser()).toEqual({
      status: 'unreachable',
    });
  });

  it('logs out without throwing when the server is gone', async () => {
    const { api, fetchImpl } = apiAnswering(new TypeError('offline'));
    await expect(api.logout()).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledWith(
      AUTH_PATHS.logout,
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

describe('ensureTower', () => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  it('creates a tower for an account without one', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ user: { id: 1, username: 'ana' }, tower: null }))
      .mockResolvedValueOnce(json({ tower: { id: 7 } }, 201));
    expect(await createAuthApi(fetchImpl).ensureTower()).toBe(true);
    expect(fetchImpl).toHaveBeenLastCalledWith(
      '/api/tower',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('leaves an account that already has a tower alone', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ user: { id: 1, username: 'ana' }, tower: { id: 7 } }));
    expect(await createAuthApi(fetchImpl).ensureTower()).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('reports false when the server cannot be reached', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('offline'));
    expect(await createAuthApi(fetchImpl).ensureTower()).toBe(false);
  });
});
