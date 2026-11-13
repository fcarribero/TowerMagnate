import type { AuthUser } from '@tower-magnate/shared';
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { AuthApi } from '../api/authApi';
import { AuthScreen } from './auth/AuthScreen';
import { t, type StringKey } from './strings';

type Session =
  | { status: 'checking' }
  | { status: 'signedIn'; user: AuthUser }
  | { status: 'signedOut'; notice?: StringKey };

/** How long to wait before asking the server again while it cannot be reached. */
const RETRY_MS = 2000;

export interface SessionGateProps {
  api: AuthApi;
  /** Milliseconds between attempts while the server cannot be reached. */
  retryMs?: number;
  /** The game, shown only to a signed-in player. */
  children: (session: {
    user: AuthUser;
    logout: () => void;
    /** The server no longer accepts the session: back to login with a notice. */
    sessionLost: () => void;
  }) => ComponentChildren;
}

/**
 * Sends a signed-in player to the game and everyone else to the login screen. While the server
 * cannot be reached it shows the connecting message and keeps trying, so the login form only
 * appears once the server has answered that a login is needed.
 */
export function SessionGate({ api, retryMs = RETRY_MS, children }: SessionGateProps) {
  const [session, setSession] = useState<Session>({ status: 'checking' });
  const mounted = useRef(true);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  const later = (action: () => void): void => {
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      action();
    }, retryMs);
    timers.current.add(timer);
  };

  /** Sets the tower up, trying again until the server answers. */
  const enterGame = (user: AuthUser): void => {
    setSession({ status: 'checking' });
    void api.ensureTower().then((ready) => {
      if (!mounted.current) {
        return;
      }
      if (ready) {
        setSession({ status: 'signedIn', user });
      } else {
        later(() => enterGame(user));
      }
    });
  };

  const check = (): void => {
    void api.currentUser().then((result) => {
      if (!mounted.current) {
        return;
      }
      if (result.status === 'unreachable') {
        later(check);
      } else if (result.status === 'signedIn') {
        enterGame(result.user);
      } else {
        setSession({ status: 'signedOut' });
      }
    });
  };

  useEffect(() => {
    mounted.current = true;
    check();
    const pending = timers.current;
    return () => {
      mounted.current = false;
      for (const timer of pending) {
        clearTimeout(timer);
      }
      pending.clear();
    };
  }, [api]);

  if (session.status === 'checking') {
    return <p class="session-loading">{t('dialog.connecting.body')}</p>;
  }

  if (session.status === 'signedOut') {
    return <AuthScreen api={api} notice={session.notice} onSignedIn={enterGame} />;
  }

  // Waiting for the server keeps a late logout from clearing the cookie of the next login.
  const logout = (): void => {
    void api.logout().then(() => setSession({ status: 'signedOut' }));
  };
  const sessionLost = (): void => setSession({ status: 'signedOut', notice: 'auth.sessionClosed' });
  return <>{children({ user: session.user, logout, sessionLost })}</>;
}
