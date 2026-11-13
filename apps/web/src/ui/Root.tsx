import { useMemo, useState } from 'preact/hooks';
import { createAuthApi, type AuthApi } from '../api/authApi';
import { createTowerApi, type TowerApi } from '../api/towerApi';
import { App } from './App';
import { SessionGate } from './SessionGate';
import { t } from './strings';
import { useUiScale } from './uiScale';

export interface RootProps {
  api?: AuthApi;
  towerApi?: TowerApi;
}

export function Root({ api, towerApi }: RootProps) {
  const { tooSmall } = useUiScale();
  const authApi = useMemo(() => api ?? createAuthApi(), [api]);
  const tower = useMemo(() => towerApi ?? createTowerApi(), [towerApi]);
  // A new key remounts the game so it reconnects to the fresh tower.
  const [towerGeneration, setTowerGeneration] = useState(0);
  const restartTower = async (): Promise<boolean> => {
    const restarted = await tower.resetTower();
    if (restarted) {
      setTowerGeneration((generation) => generation + 1);
    }
    return restarted;
  };

  if (tooSmall) {
    return <p class="viewport-too-small">{t('ui.viewportTooSmall')}</p>;
  }
  return (
    <SessionGate api={authApi}>
      {({ user, logout, sessionLost }) => (
        <App
          key={towerGeneration}
          developer={user.developer === true}
          onLogout={logout}
          onRestartTower={restartTower}
          onSessionLost={sessionLost}
        />
      )}
    </SessionGate>
  );
}
