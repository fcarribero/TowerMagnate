import type { StarRating } from '@tower-magnate/shared';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { TOWER_LAYOUT, type Level } from '@tower-magnate/shared';
import { createCommandApi } from '../api/commandApi';
import { useSfx } from '../audio/useSfx';
import { pageTitle } from '../index';
import { TowerContentStore } from '../model/towerContent';
import { useGameConnection } from '../net/useGameConnection';
import { placeholderTowerContent } from '../render/placeholderTower';
import { bindPreview, previewToolOf } from '../render/placementSource';
import type { Stage } from '../render/stage';
import { bindUnitClicks } from '../render/unitClick';
import { bindShafts, carSourceOf } from '../render/elevatorSource';
import { bindStructure, fullWidthTestTower, testTowerFromQuery } from '../render/structureSource';
import { bindUnits, debugStructure, debugUnits, testUnitsFromQuery } from '../render/unitSource';
import type { OverlayId } from '../render/overlayColors';
import { OverlayLegend } from './overlay/OverlayLegend';
import { OverlaySelector } from './overlay/OverlaySelector';
import { overlayForKey } from './overlay/overlayModel';
import { FinanceWindow } from './finance/FinanceWindow';
import { isFinanceToggleKey, isMapToggleKey, isPlainShortcut } from './keys';
import { ConnectionOverlay } from './ConnectionOverlay';
import { BuildFeedback } from './placement/BuildFeedback';
import { bindBuildInput, type DragLabel } from './placement/bindBuildInput';
import { bindDemolishInput } from './placement/bindDemolishInput';
import { DemolishConfirm } from './placement/DemolishConfirm';
import type { Confirmation } from './placement/demolishPlan';
import { buildMode, shaftIdAt } from './placement/buildPlan';
import { useBuildFeedback } from './placement/useBuildFeedback';
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
import { Toasts } from './toast/Toasts';
import { UnitWindows } from './unit/UnitWindows';

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
  const [financeOpen, setFinanceOpen] = useState(false);
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
    if (id === 'finance') {
      setFinanceOpen((open) => !open);
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
  const [pendingDemolition, setPendingDemolition] = useState<{
    confirmation: Confirmation;
    proceed: () => void;
  } | null>(null);
  const [dragLabel, setDragLabel] = useState<DragLabel | null>(null);
  const [mainLobbyHeight, setMainLobbyHeight] = useState<number | null>(null);
  const [pointerLevel, setPointerLevel] = useState<Level | null>(null);
  const onMainLobbyLevel = pointerLevel === TOWER_LAYOUT.mainLobbyFloor;
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
      stage.showStructure(debugStructure());
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
    if (tool === 'bulldozer') {
      return;
    }
    return bindPreview(stage, connection.store, previewToolOf(tool));
  }, [stage, connection, tool]);

  useEffect(() => {
    if (stage === null || tool !== 'inspect') {
      return;
    }
    return bindUnitClicks(stage, connection.store, (unitId) =>
      connection.inspect.requestUnitWindow(unitId),
    );
  }, [stage, connection, tool]);

  useEffect(() => {
    if (stage === null) {
      return;
    }
    stage.setPrimaryDragPans(buildMode(tool) === 'none');
    if (tool === 'bulldozer') {
      const unbindDemolish = bindDemolishInput({
        stage,
        api: commandApi,
        world: () => {
          const state = connection.store.current?.latest;
          return state === undefined
            ? null
            : {
                structure: state.structure,
                units: state.units.values(),
                transports: state.transports.values(),
                shafts: state.shafts.values(),
                cars: state.cars.values(),
              };
        },
        watchWorld: (listener) =>
          connection.store.select(
            (state) => ({
              structure: state.structure,
              units: state.units,
              transports: state.transports,
              shafts: state.shafts,
            }),
            listener,
          ),
        confirm: (confirmation, proceed) => setPendingDemolition({ confirmation, proceed }),
        onOutcome: (outcome, _command, at) => report(outcome, at),
      });
      return () => {
        unbindDemolish();
        setPendingDemolition(null);
        stage.setPrimaryDragPans(true);
      };
    }
    const unbind = bindBuildInput({
      stage,
      api: commandApi,
      tool,
      lobbyHeight,
      lobbyHeightAt: (level) =>
        level === TOWER_LAYOUT.mainLobbyFloor
          ? (connection.store.current?.latest.mainLobbyHeight ?? null)
          : null,
      shaftAt: (cell) => shaftIdAt(connection.store.current?.latest.shafts.values(), cell),
      onDragLabel: setDragLabel,
      onOutcome: (outcome, _command, at) => report(outcome, at),
    });
    return () => {
      unbind();
      stage.setPrimaryDragPans(true);
    };
  }, [stage, connection, commandApi, tool, lobbyHeight, report]);

  useEffect(() => {
    if (stage === null) {
      return;
    }
    const stopHover = stage.onHoverLevel((level) => {
      if (level !== null) {
        setPointerLevel(level);
      }
    });
    const stopHeight = connection.store.select(
      (state) => state.mainLobbyHeight,
      setMainLobbyHeight,
    );
    return () => {
      stopHover();
      stopHeight();
    };
  }, [stage, connection]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isMapToggleKey(event)) {
        setMapOpen((open) => !open);
        return;
      }
      if (isFinanceToggleKey(event)) {
        setFinanceOpen((open) => !open);
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
          lockedLobbyHeight={onMainLobbyLevel ? (mainLobbyHeight ?? undefined) : undefined}
          showMainLobbyWarning={onMainLobbyLevel && mainLobbyHeight === null}
          disabled={!connected}
        />
        <BuildFeedback toasts={toasts} floats={floats} dragLabel={dragLabel} />
        <ConnectionOverlay
          status={connectionStatus}
          protocolMismatch={protocolMismatch}
          onReload={() => location.reload()}
        />
        {mapOpen && stage && (
          <TowerMapWindow content={content} stage={stage} onClose={() => setMapOpen(false)} />
        )}
        <Toasts commands={connection.commands} />
        <WindowLayer class="ui-windows">
          <DemolishConfirm
            confirmation={pendingDemolition?.confirmation ?? null}
            onConfirm={() => {
              pendingDemolition?.proceed();
              setPendingDemolition(null);
            }}
            onCancel={() => setPendingDemolition(null)}
          />
          {financeOpen && (
            <FinanceWindow store={connection.store} onClose={() => setFinanceOpen(false)} />
          )}
          <UnitWindows connection={connection} />
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
