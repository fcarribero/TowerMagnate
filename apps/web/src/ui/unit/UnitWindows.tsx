import { useEffect, useRef, useState } from 'preact/hooks';
import type { InspectTarget } from '@tower-magnate/shared';
import type { GameConnection } from '../../net/gameConnection';
import type { Stage } from '../../render/stage';
import { useWindowManager } from '../kit';
import { findWindow, type Point } from '../kit/windowStack';
import {
  UNIT_PANEL_KIND,
  UNIT_WINDOW_KIND,
  unitPanelId,
  entityOfWindow,
  diffInspectTargets,
  inspectTargetKey,
  openInspectTargets,
  unitWindowId,
} from '../inspectTarget';
import { UnitWindow } from './UnitWindow';
import { ANCHOR_GAP, anchoredPosition } from './unitAnchor';

const FIRST_WINDOW_POSITION = { x: 40, y: 40 };
const CASCADE_STEP = 12;

/** The part of the stage the fixed panel needs to follow a unit on screen. */
export type PanelStage = Pick<Stage, 'unitScreenRect' | 'cssPerDevicePixel' | 'onCameraChange'>;

interface UnitWindowsProps {
  connection: GameConnection;
  stage?: PanelStage | null;
}

const PANEL_FALLBACK_HEIGHT = 200;

/** Clicks on these never close the panel: the canvas decides for itself, dialogs belong to the panel. */
function isInsidePanelArea(target: EventTarget | null, panelId: string): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  return (
    target.closest('canvas') !== null ||
    target.closest(`[data-window-id="${panelId}"]`) !== null ||
    target.closest('.tm-window--dialog, .tm-modal-backdrop') !== null
  );
}

/**
 * Opens a unit window whenever a list asks for one, shows the fixed panel of the
 * unit the Lupa points at, and keeps the server inspecting every open unit,
 * person and elevator window.
 */
export function UnitWindows({ connection, stage = null }: UnitWindowsProps) {
  const manager = useWindowManager();
  const unitWindows = manager.stack.windows.filter((window) => window.kind === UNIT_WINDOW_KIND);
  const targets = openInspectTargets(manager.stack.windows);
  const targetKeys = targets.map(inspectTargetKey).join(',');
  const sentTargets = useRef<InspectTarget[]>([]);
  const { inspect } = connection;
  const [anchoredId, setAnchoredId] = useState(() => inspect.anchoredUnit());
  const managerRef = useRef(manager);
  managerRef.current = manager;
  const anchoredRef = useRef(anchoredId);
  anchoredRef.current = anchoredId;

  useEffect(() => {
    setAnchoredId(inspect.anchoredUnit());
    return inspect.onAnchorChange(() => setAnchoredId(inspect.anchoredUnit()));
  }, [inspect]);

  const placePanel = (): Point | null => {
    const unitId = anchoredRef.current;
    const current = managerRef.current;
    const rect = unitId === null ? null : (stage?.unitScreenRect(unitId) ?? null);
    if (unitId === null || rect === null || stage === null) {
      return null;
    }
    const canvas = document.querySelector('.stage-host canvas')?.getBoundingClientRect();
    const scale = stage.cssPerDevicePixel();
    const frame = document.querySelector<HTMLElement>(
      `[data-window-id="${unitPanelId(unitId)}"]`,
    );
    const size = frame
      ? { width: frame.offsetWidth, height: frame.offsetHeight }
      : { width: 200 * current.uiScale, height: PANEL_FALLBACK_HEIGHT * current.uiScale };
    return anchoredPosition(
      {
        x: (canvas?.left ?? 0) + rect.x * scale,
        y: (canvas?.top ?? 0) + rect.y * scale,
        width: rect.width * scale,
        height: rect.height * scale,
      },
      size,
      current.viewSize,
      ANCHOR_GAP * current.uiScale,
    );
  };

  const followUnit = (): void => {
    const unitId = anchoredRef.current;
    const position = placePanel();
    if (unitId === null || position === null) {
      return;
    }
    const open = findWindow(managerRef.current.stack, unitPanelId(unitId));
    if (open !== undefined && (open.position.x !== position.x || open.position.y !== position.y)) {
      managerRef.current.move(unitPanelId(unitId), position);
    }
  };

  useEffect(() => {
    if (anchoredId === null) {
      return;
    }
    const id = unitPanelId(anchoredId);
    managerRef.current.open({
      id,
      kind: UNIT_PANEL_KIND,
      position: placePanel() ?? FIRST_WINDOW_POSITION,
    });
    return () => managerRef.current.close(id);
  }, [anchoredId]);

  useEffect(() => {
    if (anchoredId === null) {
      return;
    }
    const stopCamera = stage?.onCameraChange(followUnit);
    const stopInspect = inspect.subscribe(followUnit);
    const onPointerDown = (event: PointerEvent): void => {
      if (!isInsidePanelArea(event.target, unitPanelId(anchoredId))) {
        inspect.clearAnchor();
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      stopCamera?.();
      stopInspect();
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [anchoredId, stage, inspect]);

  // The panel changes size when its data arrives, and the view can be resized.
  useEffect(followUnit);

  useEffect(
    () =>
      connection.inspect.onUnitWindowRequest((unitId) => {
        const offset = (manager.stack.openCount % 4) * CASCADE_STEP;
        manager.open({
          id: unitWindowId(unitId),
          kind: UNIT_WINDOW_KIND,
          position: { x: FIRST_WINDOW_POSITION.x + offset, y: FIRST_WINDOW_POSITION.y + offset },
        });
      }),
    [connection, manager],
  );

  useEffect(() => {
    const { added, removed } = diffInspectTargets(sentTargets.current, targets);
    removed.forEach((target) => connection.commands.inspectRemove(target));
    added.forEach((target) => connection.commands.inspectAdd(target));
    sentTargets.current = targets;
  }, [connection, targetKeys]);

  return (
    <>
      {unitWindows.map((window) => (
        <UnitWindow key={window.id} unitId={entityOfWindow(window.id)} connection={connection} />
      ))}
      {anchoredId !== null && (
        <UnitWindow key={unitPanelId(anchoredId)} unitId={anchoredId} connection={connection} anchored />
      )}
    </>
  );
}
