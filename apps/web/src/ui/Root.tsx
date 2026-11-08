import { useMemo } from 'preact/hooks';
import { createAuthApi, type AuthApi } from '../api/authApi';
import { App } from './App';
import { SessionGate } from './SessionGate';
import { t } from './strings';
import { useUiScale } from './uiScale';

export interface RootProps {
  api?: AuthApi;
}

export function Root({ api }: RootProps) {
  const { tooSmall } = useUiScale();
  const authApi = useMemo(() => api ?? createAuthApi(), [api]);

  if (tooSmall) {
    return <p class="viewport-too-small">{t('ui.viewportTooSmall')}</p>;
  }
  return (
    <SessionGate api={authApi}>
      {({ logout, sessionLost }) => <App onLogout={logout} onSessionLost={sessionLost} />}
    </SessionGate>
  );
}
