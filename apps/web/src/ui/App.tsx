import type { StarRating } from '@tower-magnate/shared';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { useSfx } from '../audio/useSfx';
import { pageTitle } from '../index';
import { TowerContentStore } from '../model/towerContent';
import { useGameConnection } from '../net/useGameConnection';
import { placeholderTowerContent } from '../render/placeholderTower';
import { bindPreview, previewToolOf } from '../render/placementSource';
import type { Stage } from '../render/stage';
import { bindShafts, carSourceOf } from '../render/elevatorSource';
import { bindStructure, fullWidthTestTower, testTowerFromQuery } from '../render/structureSource';
import { DEBUG_UNIT_FLOORS, bindUnits, debugUnits, testUnitsFromQuery } from '../render/unitSource';
import type { OverlayId } from '../render/overlayColors';
import { OverlayLegend } from './overlay/OverlayLegend';
import { OverlaySelector } from './overlay/OverlaySelector';
import { overlayForKey } from './overlay/overlayModel';
import { isMapToggleKey, isPlainShortcut } from './keys';
import { ConnectionOverlay } from './ConnectionOverlay';
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
  const [overlay, setOverlay] = useState<OverlayId>('normal');
  const [tool, setTool] = useState<ToolId>(DEFAULT_TOOL);
  const [lobbyHeight, setLobbyHeight] = useState(DEFAULT_LOBBY_HEIGHT);
  // Replaced by the tower's rating once the game state reaches the client.
  const stars: StarRating = (import.meta.env.DEV && debugStarsFromQuery(location.search)) || 1;
  const onOpenWindow = (id: StatusWindowId): void => {
    if (id === 'map') {
      setMapOpen((open) => !open);
    }
  };
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
    const testUnitsHour = import.meta.env.DEV ? testUnitsFromQuery(location.search) : null;
    if (testUnitsHour !== null) {
      stage.showStructure(fullWidthTestTower(DEBUG_UNIT_FLOORS));
      stage.showUnits(debugUnits(testUnitsHour, overlay));
      return;
    }
    const unbindUnits = bindUnits(connection.store, overlay, (input) => stage.showUnits(input));
    const unbindStructure = bindStructure(connection.store, (input) => stage.showStructure(input));
    const unbindShafts = bindShafts(connection.store, (shafts) => stage.showShafts(shafts));
    stage.feedCars(carSourceOf(connection.store));
    return () => {
      unbindUnits();
      unbindStructure();
      unbindShafts();
      stage.feedCars(null);
    };
  }, [stage, connection, overlay]);

  useEffect(() => {
    if (stage === null) {
      return;
    }
    return bindPreview(stage, connection.store, previewToolOf(tool));
  }, [stage, connection, tool]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isMapToggleKey(event)) {
        setMapOpen((open) => !open);
        return;
      }
      const picked = isPlainShortcut(event) ? overlayForKey(event.key) : null;
      if (picked !== null) {
        setOverlay(picked);
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
          overlaySlot={<OverlaySelector overlay={overlay} onSelect={setOverlay} />}
          onZoom={(direction) => stage?.zoomStep(direction)}
          onLogout={onLogout}
          extraMenuItems={[
            { id: 'newTower', label: t('ui.newTower'), onSelect: () => setRestartStep('first') },
          ]}
        />
        <OverlayLegend overlay={overlay} />
        <Toolbar
          stars={stars}
          currentTool={tool}
          onSelectTool={setTool}
          lobbyHeight={lobbyHeight}
          onLobbyHeightChange={setLobbyHeight}
          disabled={!connected}
        />
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
