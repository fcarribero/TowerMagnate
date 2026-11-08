import type { StarRating } from '@tower-magnate/shared';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { createCommandApi } from '../api/commandApi';
import { useSfx } from '../audio/useSfx';
import { pageTitle } from '../index';
import { TowerContentStore } from '../model/towerContent';
import { useGameConnection } from '../net/useGameConnection';
import { placeholderTowerContent } from '../render/placeholderTower';
import { bindPreview, previewToolOf } from '../render/placementSource';
import type { Stage } from '../render/stage';
import { bindStructure, fullWidthTestTower, testTowerFromQuery } from '../render/structureSource';
import { DEBUG_UNIT_FLOORS, bindUnits, debugUnits, testUnitsFromQuery } from '../render/unitSource';
import { isMapToggleKey } from './keys';
import { ConnectionOverlay } from './ConnectionOverlay';
import { BuildFeedback } from './build/BuildFeedback';
import { bindBuildInput } from './build/bindBuildInput';
import { buildMode } from './build/buildPlan';
import { useBuildFeedback } from './build/useBuildFeedback';
import { LevelRuler } from './LevelRuler';
import { StageHost } from './StageHost';
import { WindowLayer } from './kit';
import { RestartTowerDialogs, type RestartStep } from './menu/RestartTowerDialogs';
import { StatusPanel, type StatusWindowId } from './status/StatusPanel';
import { debugStarsFromQuery } from './toolbar/debugStars';
import { t } from './strings';
import { Toolbar } from './toolbar/Toolbar';
import { DEFAULT_LOBBY_HEIGHT, DEFAULT_TOOL, type ToolId } from './toolbar/toolbarModel';
import { TowerMapWindow } from './TowerMapWindow';

export interface AppProps {
  onLogout: () => void;
  /** Resolves true when the server started a new tower. */
  onRestartTower: () => Promise<boolean>;
  onSessionLost: () => void;
}

export function App({ onLogout, onRestartTower, onSessionLost }: AppProps) {
  const {
    connection,
    status: connectionStatus,
    protocolMismatch,
  } = useGameConnection({ onNotAuthenticated: onSessionLost });
  const connected = connectionStatus === 'live';
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
  const onOpenWindow = (id: StatusWindowId): void => {
    if (id === 'map') {
      setMapOpen((open) => !open);
    }
  };
  const { playTrigger, director } = useSfx();
  const commandApi = useMemo(() => {
    const api = createCommandApi({
      channel: connection.socket,
      onSent: (queued) => director.commandSent(queued),
    });
    connection.onMessage((message) => {
      api.receive(message);
      if (message.t === 'commandResult') {
        director.serverMessage(message);
      }
    });
    return api;
  }, [connection, director]);
  const { toasts, floats, report } = useBuildFeedback();
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
    const testUnitsHour = import.meta.env.DEV ? testUnitsFromQuery(location.search) : null;
    if (testUnitsHour !== null) {
      stage.showStructure(fullWidthTestTower(DEBUG_UNIT_FLOORS));
      stage.showUnits(debugUnits(testUnitsHour));
      return;
    }
    const unbindUnits = bindUnits(connection.store, (input) => stage.showUnits(input));
    const unbindStructure = bindStructure(connection.store, (input) => stage.showStructure(input));
    return () => {
      unbindUnits();
      unbindStructure();
    };
  }, [stage, connection]);

  useEffect(() => {
    if (stage === null) {
      return;
    }
    return bindPreview(stage, connection.store, previewToolOf(tool));
  }, [stage, connection, tool]);

  useEffect(() => {
    if (stage === null) {
      return;
    }
    stage.setPrimaryDragPans(buildMode(tool) === 'none');
    const unbind = bindBuildInput({
      stage,
      api: commandApi,
      tool,
      lobbyHeight,
      onOutcome: (outcome, _command, at) => report(outcome, at),
    });
    return () => {
      unbind();
      stage.setPrimaryDragPans(true);
    };
  }, [stage, commandApi, tool, lobbyHeight, report]);

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
        <StatusPanel
          store={connection.store}
          offline={connectionStatus !== 'live'}
          onOpenWindow={onOpenWindow}
          onZoom={(direction) => stage?.zoomStep(direction)}
          onLogout={onLogout}
          extraMenuItems={[
            { id: 'newTower', label: t('ui.newTower'), onSelect: () => setRestartStep('first') },
          ]}
        />
        <Toolbar
          stars={stars}
          currentTool={tool}
          onSelectTool={setTool}
          lobbyHeight={lobbyHeight}
          onLobbyHeightChange={setLobbyHeight}
          disabled={!connected}
        />
        <BuildFeedback toasts={toasts} floats={floats} />
        <ConnectionOverlay
          status={connectionStatus}
          protocolMismatch={protocolMismatch}
          onReload={() => location.reload()}
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
