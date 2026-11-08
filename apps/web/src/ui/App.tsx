import type { StarRating } from '@tower-magnate/shared';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { useSfx } from '../audio/useSfx';
import { pageTitle } from '../index';
import { TowerContentStore } from '../model/towerContent';
import { useGameConnection } from '../net/useGameConnection';
import { placeholderTowerContent } from '../render/placeholderTower';
import type { Stage } from '../render/stage';
import { bindStructure, fullWidthTestTower, testTowerFromQuery } from '../render/structureSource';
import { isMapToggleKey } from './keys';
import { LevelRuler } from './LevelRuler';
import { StageHost } from './StageHost';
import './kit';
import { WindowLayer } from './kit';
import { GameMenu } from './menu/GameMenu';
import { RestartTowerDialogs, type RestartStep } from './menu/RestartTowerDialogs';
import { t } from './strings';
import { debugStarsFromQuery } from './toolbar/debugStars';
import { Toolbar } from './toolbar/Toolbar';
import { DEFAULT_LOBBY_HEIGHT, DEFAULT_TOOL, type ToolId } from './toolbar/toolbarModel';
import { TowerMapWindow } from './TowerMapWindow';

export interface AppProps {
  onLogout: () => void;
  /** Resolves true when the server started a new tower. */
  onRestartTower: () => Promise<boolean>;
}

export function App({ onLogout, onRestartTower }: AppProps) {
  const { connection, status: connectionStatus } = useGameConnection();
  const content = useMemo(() => {
    const store = new TowerContentStore();
    store.applySnapshot(placeholderTowerContent());
    return store;
  }, []);
  const [stage, setStage] = useState<Stage | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [restartStep, setRestartStep] = useState<RestartStep | null>(null);
  const [tool, setTool] = useState<ToolId>(DEFAULT_TOOL);
  const [lobbyHeight, setLobbyHeight] = useState(DEFAULT_LOBBY_HEIGHT);
  // Replaced by the tower's rating once the game state reaches the client.
  const stars: StarRating = (import.meta.env.DEV && debugStarsFromQuery(location.search)) || 1;
  const toggleMap = (): void => setMapOpen((open) => !open);
  const { playTrigger } = useSfx();
  const onUiClick = (event: MouseEvent): void => {
    if (event.target instanceof Element && event.target.closest('button') !== null) {
      playTrigger('ui.click');
    }
  };

  const restartTower = (): void => {
    setRestartStep(null);
    void onRestartTower().then((restarted) => {
      if (!restarted) {
        setRestartStep('failed');
      }
    });
  };

  useEffect(() => {
    document.title = pageTitle();
  }, []);

  useEffect(() => {
    if (stage === null) {
      return;
    }
    const testTowerFloors = import.meta.env.DEV && testTowerFromQuery(location.search);
    if (testTowerFloors) {
      stage.showStructure(fullWidthTestTower(testTowerFloors));
      return;
    }
    return bindStructure(connection.store, (input) => stage.showStructure(input));
  }, [stage, connection]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isMapToggleKey(event)) {
        setMapOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <>
      <StageHost onStage={setStage} />
      <div class="ui-layer" onClick={onUiClick}>
        {stage && <LevelRuler stage={stage} />}
        <div class="status-panel">
          <GameMenu onRestartTower={() => setRestartStep('first')} onLogout={onLogout} />
          {connectionStatus !== 'live' && t('ui.serverOffline')}
          <button type="button" class="status-button" onClick={toggleMap}>
            Mapa
          </button>
        </div>
        <Toolbar
          stars={stars}
          currentTool={tool}
          onSelectTool={setTool}
          lobbyHeight={lobbyHeight}
          onLobbyHeightChange={setLobbyHeight}
        />
        {mapOpen && stage && (
          <TowerMapWindow content={content} stage={stage} onClose={() => setMapOpen(false)} />
        )}
        <WindowLayer class="ui-windows">
          <RestartTowerDialogs
            step={restartStep}
            onStep={setRestartStep}
            onRestart={restartTower}
          />
        </WindowLayer>
      </div>
    </>
  );
}
