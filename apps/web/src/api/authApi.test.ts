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

  it('reads 429 as rate limited, apart from other failures', async () => {
    expect(await apiAnswering(jsonResponse(429, { error: 'x' })).api.login(credentials)).toEqual({
      ok: false,
      reason: 'rateLimited',
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
