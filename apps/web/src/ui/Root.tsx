import { useMemo, useState } from 'preact/hooks';
import { createAuthApi, type AuthApi } from '../api/authApi';
import { createTowerApi, type TowerApi } from '../api/towerApi';
import { App } from './App';
import { SessionGate } from './SessionGate';
import { TowerLoader } from './TowerLoader';
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
  // A new key remounts the loader and the game, so they start a new play session.
  const [towerGeneration, setTowerGeneration] = useState(0);
  const newPlaySession = (): void => setTowerGeneration((generation) => generation + 1);
  // App stopped its Worker before this, so the game must come back even when the reset failed.
  const restartTower = async (): Promise<boolean> => {
    const restarted = await tower.resetTower();
    newPlaySession();
    return restarted;
  };

  if (tooSmall) {
    return <p class="viewport-too-small">{t('ui.viewportTooSmall')}</p>;
  }
  return (
    <SessionGate api={authApi}>
      {({ user, logout, sessionLost }) => (
        <TowerLoader key={towerGeneration} towerApi={tower} onSessionLost={sessionLost}>
          {(play) => (
            <App
              play={play}
              onPlayHere={newPlaySession}
              developer={user.developer === true}
              onLogout={logout}
              onRestartTower={restartTower}
            />
          )}
        </TowerLoader>
      )}
    </SessionGate>
  );
}
