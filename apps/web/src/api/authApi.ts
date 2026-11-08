import type { AuthUser, Credentials } from '@tower-magnate/shared';

export const AUTH_PATHS = {
  register: '/api/auth/register',
  login: '/api/auth/login',
  logout: '/api/auth/logout',
  me: '/api/auth/me',
} as const;

export const TOWER_PATHS = {
  account: '/api/account',
  create: '/api/tower',
} as const;

export type AuthFailure =
  | { ok: false; reason: 'usernameTaken' }
  | { ok: false; reason: 'wrongCredentials' }
  | { ok: false; reason: 'rejected'; message: string }
  | { ok: false; reason: 'network' };

export type AuthResult = { ok: true; user: AuthUser } | AuthFailure;

export type SessionCheck =
  { status: 'signedIn'; user: AuthUser } | { status: 'signedOut' } | { status: 'unreachable' };

type Fetch = typeof fetch;

export interface AuthApi {
  currentUser(): Promise<SessionCheck>;
  login(credentials: Credentials): Promise<AuthResult>;
  register(credentials: Credentials): Promise<AuthResult>;
  logout(): Promise<void>;
  /** Gives a new account its tower; false when the server could not be reached or refused. */
  ensureTower(): Promise<boolean>;
}

/** Talks to the auth routes; the session itself lives in an HttpOnly cookie. */
export function createAuthApi(fetchImpl: Fetch = (input, init) => fetch(input, init)): AuthApi {
  async function postCredentials(path: string, credentials: Credentials): Promise<AuthResult> {
    let response: Response;
    try {
      response = await fetchImpl(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(credentials),
      });
    } catch {
      return { ok: false, reason: 'network' };
    }
    if (response.ok) {
      return { ok: true, user: await readUser(response) };
    }
    return failureFor(response);
  }

  return {
    async currentUser() {
      let response: Response;
      try {
        response = await fetchImpl(AUTH_PATHS.me, { credentials: 'same-origin' });
      } catch {
        return { status: 'unreachable' };
      }
      if (response.status === 401) {
        return { status: 'signedOut' };
      }
      if (!response.ok) {
        return { status: 'unreachable' };
      }
      return { status: 'signedIn', user: await readUser(response) };
    },
    login: (credentials) => postCredentials(AUTH_PATHS.login, credentials),
    register: (credentials) => postCredentials(AUTH_PATHS.register, credentials),
    async ensureTower() {
      try {
        const account = await fetchImpl(TOWER_PATHS.account, { credentials: 'same-origin' });
        if (!account.ok) {
          return false;
        }
        const { tower } = (await account.json()) as { tower: unknown };
        if (tower !== null) {
          return true;
        }
        const created = await fetchImpl(TOWER_PATHS.create, {
          method: 'POST',
          credentials: 'same-origin',
        });
        return created.ok || created.status === 409;
      } catch {
        return false;
      }
    },
    async logout() {
      try {
        await fetchImpl(AUTH_PATHS.logout, { method: 'POST', credentials: 'same-origin' });
      } catch {
        // The player leaves the game either way; a stale cookie only fails the next /me.
      }
    },
  };
}

async function readUser(response: Response): Promise<AuthUser> {
  const body = (await response.json()) as { user: AuthUser };
  return body.user;
}

async function failureFor(response: Response): Promise<AuthFailure> {
  if (response.status === 409) {
    return { ok: false, reason: 'usernameTaken' };
  }
  if (response.status === 401) {
    return { ok: false, reason: 'wrongCredentials' };
  }
  if (response.status === 400) {
    const message = await readErrorMessage(response);
    if (message !== undefined) {
      return { ok: false, reason: 'rejected', message };
    }
  }
  return { ok: false, reason: 'network' };
}

async function readErrorMessage(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { error?: unknown };
    return typeof body.error === 'string' ? body.error : undefined;
  } catch {
    return undefined;
  }
}
