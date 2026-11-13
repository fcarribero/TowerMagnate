import type { StarRating } from '@tower-magnate/shared';
import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { TOWER_LAYOUT, type Level } from '@tower-magnate/shared';
import { createCommandApi } from '../api/commandApi';
import { useSfx } from '../audio/useSfx';
import { pageTitle } from '../index';
import { bindTowerContent } from '../model/stateContent';
import { TowerContentStore } from '../model/towerContent';
import { useGameConnection } from '../net/useGameConnection';
import { bindPreview, previewToolOf } from '../render/placementSource';
import type { Stage } from '../render/stage';
import { bindUnitClicks } from '../render/unitClick';
import { bindShafts, carSourceOf } from '../render/elevatorSource';
import { bindFollowed } from '../render/followedSource';
import { bindEffects, bindEvents } from '../render/eventSource';
import { bindStructure, fullWidthTestTower, testTowerFromQuery } from '../render/structureSource';
import { skyPhaseAt, stepAtHour } from '../render/timeOfDay';
import {
  bindSky,
  bindUnits,
  debugStructure,
  debugUnits,
  testUnitsFromQuery,
} from '../render/unitSource';
import type { OverlayId } from '../render/overlayColors';
import { OverlayLegend } from './overlay/OverlayLegend';
import { OverlaySelector } from './overlay/OverlaySelector';
import { overlayForKey } from './overlay/overlayModel';
import { FinanceWindow } from './finance/FinanceWindow';
import { isFinanceToggleKey, isMapToggleKey, isPlainShortcut } from './keys';
import { ConnectionOverlay } from './ConnectionOverlay';
import { SpeedControls } from './developer/SpeedControls';
import { useDeveloperMenu } from './developer/useDeveloperMenu';
import { BuildFeedback } from './placement/BuildFeedback';
import { bindBuildInput, type DragLabel } from './placement/bindBuildInput';
import { bindDemolishInput } from './placement/bindDemolishInput';
import { DemolishConfirm } from './placement/DemolishConfirm';
import type { Confirmation } from './placement/demolishPlan';
import { buildMode, grabShaft } from './placement/buildPlan';
import { IncomeFloaters } from './income/IncomeFloaters';
import { useIncomeFloaters } from './income/useIncomeFloaters';
import { useBuildFeedback } from './placement/useBuildFeedback';
import { StageHost } from './StageHost';
import { WindowLayer } from './kit';
import { RestartTowerDialogs, type RestartStep } from './menu/RestartTowerDialogs';
import { StarsWindow } from './stars/StarsWindow';
import { StatusPanel, type StatusWindowId } from './status/StatusPanel';
import { debugStarsFromQuery } from './toolbar/debugStars';
import { t } from './strings';
import { useViewportUiScale } from './uiScale';
import { Toolbar } from './toolbar/Toolbar';
import { DEFAULT_LOBBY_HEIGHT, DEFAULT_TOOL, type ToolId } from './toolbar/toolbarModel';
import { TowerMapWindow } from './TowerMapWindow';
import { AvisosWindow } from './notices/AvisosWindow';
import { DecisionDialogs } from './notices/DecisionDialogs';
import { InfoDialogs } from './notices/InfoDialogs';
import { NewsLine } from './notices/NewsLine';
import { useNotices } from './notices/useNotices';
import { useUnreadCount } from './notices/useUnreadCount';
import { Toasts } from './toast/Toasts';
import { ElevatorWindows } from './elevator/ElevatorWindows';
import { FollowedWindow } from './person/FollowedWindow';
import { PersonWindows } from './person/PersonWindows';
import { UnitWindows } from './unit/UnitWindows';

export interface AppProps {
  /** Shows the developer entries of the game menu. */
  developer?: boolean;
  onLogout: () => void;
  /** Resolves true when the server started a new tower. */
  onRestartTower: () => Promise<boolean>;
  onSessionLost: () => void;
}

export function App({ developer = false, onLogout, onRestartTower, onSessionLost }: AppProps) {
  const {
    connection,
    status: connectionStatus,
    protocolMismatch,
  } = useGameConnection({ onNotAuthenticated: onSessionLost });
  const connected = connectionStatus === 'live';
  const content = useMemo(() => new TowerContentStore(), []);
  useEffect(() => bindTowerContent(connection.store, content), [connection, content]);
  const [stage, setStage] = useState<Stage | null>(null);
  const uiScale = useViewportUiScale();
  const [mapOpen, setMapOpen] = useState(false);
  const [financeOpen, setFinanceOpen] = useState(false);
  const [avisosOpen, setAvisosOpen] = useState(false);
  const [starsOpen, setStarsOpen] = useState(false);
  const [followedOpen, setFollowedOpen] = useState(false);
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
    if (id === 'notices') {
      setAvisosOpen((open) => !open);
    }
    if (id === 'stars') {
      setStarsOpen((open) => !open);
    }
    if (id === 'followed') {
      setFollowedOpen((open) => !open);
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
      director.serverMessage(message);
    });
    return api;
  }, [connection, director]);
  const { floats, report } = useBuildFeedback();
  const notices = useNotices(
    connection,
    useCallback((error: string) => report({ ok: false, error }, { x: 0, y: 0 }), [report]),
  );
  const unreadNotices = useUnreadCount(notices.subscribeLine, avisosOpen);
  const openWindows = useMemo(() => {
    const open = new Set<StatusWindowId>();
    const flags: [StatusWindowId, boolean][] = [
      ['map', mapOpen],
      ['finance', financeOpen],
      ['notices', avisosOpen],
      ['stars', starsOpen],
      ['followed', followedOpen],
    ];
    for (const [id, isOpen] of flags) {
      if (isOpen) {
        open.add(id);
      }
    }
    return open;
  }, [mapOpen, financeOpen, avisosOpen, starsOpen, followedOpen]);
  const incomeFloats = useIncomeFloaters(stage, connection);
  const [pendingDemolition, setPendingDemolition] = useState<{
    confirmation: Confirmation;
    proceed: () => void;
  } | null>(null);
  const [dragLabel, setDragLabel] = useState<DragLabel | null>(null);
  const [mainLobbyHeight, setMainLobbyHeight] = useState<number | null>(null);
  const [pointerLevel, setPointerLevel] = useState<Level | null>(null);
  const onMainLobbyLevel = pointerLevel === TOWER_LAYOUT.mainLobbyFloor;
  const onUiClick = (event: MouseEvent): void => {
    if (!(event.target instanceof Element) || event.target.closest('button') === null) {
      return;
    }
    // Switching a tab and closing a window are not selections.
    if (event.target.closest('[role="tab"], .tm-window__close') !== null) {
      return;
    }
    playTrigger('ui.click');
  };

  const centerView = useCallback(
    (point: { x: number; y: number }): void => stage?.centerOn(point.x, point.y),
    [stage],
  );

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
      stage.showSky(skyPhaseAt(stepAtHour(testUnitsHour)));
      return;
    }
    const unbindSky = bindSky(connection.store, (phase) => stage.showSky(phase));
    const unbindUnits = bindUnits(connection.store, overlay, (input) => stage.showUnits(input));
    const unbindStructure = bindStructure(connection.store, (input) => stage.showStructure(input));
    const unbindShafts = bindShafts(connection.store, (shafts, structure) =>
      stage.showShafts(shafts, structure),
    );
    const unbindFollowed = bindFollowed(connection.store, (followed) =>
      stage.showFollowed(followed),
    );
    const unbindEvents = bindEvents(connection.store, (input) => stage.showEvents(input));
    const unbindEffects = bindEffects(connection.onMessage, (effect) => stage.playEffect(effect));
    stage.feedCars(carSourceOf(connection.store));
    return () => {
      unbindFollowed();
      unbindEvents();
      unbindEffects();
      unbindSky();
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
    connection.viewport.cameraChanged(stage.camera());
    return stage.onCameraChange((camera) => connection.viewport.cameraChanged(camera));
  }, [stage, connection]);

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
    return bindUnitClicks(stage, connection.store, {
      person: (personId) => connection.inspect.requestPersonWindow(personId),
      unit: (unitId) => connection.inspect.requestUnitWindow(unitId),
      shaft: (shaftId) => connection.inspect.requestShaftWindow(shaftId),
    });
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
      shaftAt: (cell) => grabShaft(connection.store.current?.latest.shafts.values(), cell),
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
      // Developers use the keys 1 to 5 for the game speed.
      const picked = isPlainShortcut(event) && !developer ? overlayForKey(event.key) : null;
      if (picked !== null) {
        setOverlay(picked);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [developer]);

  const {
    items: developerMenuItems,
    settings: developerSettings,
    speedControls,
  } = useDeveloperMenu(developer, connectionStatus === 'live', (type, payload) =>
    connection.socket.sendDebug(type, payload),
  );

  return (
    <>
      <StageHost onStage={setStage} />
      <div class="ui-layer" onClick={onUiClick}>
        <StatusPanel
          store={connection.store}
          onOpenWindow={onOpenWindow}
          openWindows={openWindows}
          unreadNotices={unreadNotices}
          overlaySlot={<OverlaySelector overlay={overlay} onSelect={setOverlay} />}
          onLogout={onLogout}
          infiniteMoney={developer && developerSettings.infiniteMoney}
          belowClock={speedControls !== null && <SpeedControls {...speedControls} />}
          extraMenuItems={[
            {
              id: 'newTower',
              label: t('ui.newTower'),
              separated: true,
              onSelect: () => setRestartStep('first'),
            },
            ...developerMenuItems,
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
          onZoom={(direction) => stage?.zoomStep(direction)}
        />
        <BuildFeedback floats={floats} dragLabel={dragLabel} />
        <IncomeFloaters floaters={incomeFloats} />
        <ConnectionOverlay
          status={connectionStatus}
          protocolMismatch={protocolMismatch}
          onReload={() => location.reload()}
        />
        <Toasts commands={connection.commands} />
        <NewsLine
          subscribe={notices.subscribeLine}
          onOpenAvisos={() => setAvisosOpen(true)}
          onSeeUnit={(unitId) => stage?.centerOnUnit(unitId)}
        />
        <WindowLayer class="ui-windows" uiScale={uiScale}>
          {mapOpen && stage && (
            <TowerMapWindow content={content} stage={stage} onClose={() => setMapOpen(false)} />
          )}
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
          {avisosOpen && (
            <AvisosWindow
              notices={notices.avisos}
              onSeeUnit={(unitId) => {
                stage?.centerOnUnit(unitId);
                connection.inspect.requestUnitWindow(unitId);
              }}
              onClose={() => setAvisosOpen(false)}
            />
          )}
          {starsOpen && (
            <StarsWindow store={connection.store} onClose={() => setStarsOpen(false)} />
          )}
          {followedOpen && (
            <FollowedWindow
              connection={connection}
              onCenter={centerView}
              onClose={() => setFollowedOpen(false)}
            />
          )}
          <UnitWindows connection={connection} />
          <PersonWindows connection={connection} onCenter={centerView} />
          <InfoDialogs subscribe={connection.onMessage} />
          <DecisionDialogs
            store={connection.store}
            onAnswer={notices.answerEvent}
            closedIds={notices.closedIds}
          />
          <ElevatorWindows connection={connection} />
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
