import type { AuthUser } from '@tower-magnate/shared';
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { AuthApi } from '../api/authApi';
import { AuthScreen } from './auth/AuthScreen';
import { t, type StringKey } from './strings';

type Session =
  | { status: 'checking' }
  | { status: 'signedIn'; user: AuthUser }
  | { status: 'signedOut'; notice?: StringKey };

export interface SessionGateProps {
  api: AuthApi;
  /** The game, shown only to a signed-in player. */
  children: (session: {
    user: AuthUser;
    logout: () => void;
    /** The server no longer accepts the session: back to login with a notice. */
    sessionLost: () => void;
  }) => ComponentChildren;
}

/** Sends a signed-in player to the game and everyone else to the login screen. */
export function SessionGate({ api, children }: SessionGateProps) {
  const [session, setSession] = useState<Session>({ status: 'checking' });

  useEffect(() => {
    let cancelled = false;
    void api.currentUser().then((check) => {
      if (cancelled) {
        return;
      }
      if (check.status === 'signedIn') {
        setSession({ status: 'signedIn', user: check.user });
      } else if (check.status === 'unreachable') {
        setSession({ status: 'signedOut', notice: 'auth.networkError' });
      } else {
        setSession({ status: 'signedOut' });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [api]);

  if (session.status === 'checking') {
    return <p class="session-loading">{t('dialog.connecting.body')}</p>;
  }

  if (session.status === 'signedOut') {
    return (
      <AuthScreen
        api={api}
        notice={session.notice}
        onSignedIn={(user) => setSession({ status: 'signedIn', user })}
      />
    );
  }

  // Waiting for the server keeps a late logout from clearing the cookie of the next login.
  const logout = (): void => {
    void api.logout().then(() => setSession({ status: 'signedOut' }));
  };
  const sessionLost = (): void => setSession({ status: 'signedOut', notice: 'auth.sessionClosed' });
  return <>{children({ user: session.user, logout, sessionLost })}</>;
}
