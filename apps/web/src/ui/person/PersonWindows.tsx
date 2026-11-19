import { useEffect, useRef, useState } from 'preact/hooks';
import type { GameConnection } from '../../net/gameConnection';
import {
  PERSON_PANEL_KIND,
  PERSON_WINDOW_KIND,
  entityOfWindow,
  personPanelId,
  personWindowId,
} from '../inspectTarget';
import { useWindowManager } from '../kit';
import { findWindow, type Point } from '../kit/windowStack';
import { ANCHOR_GAP, anchoredPosition, isInsidePanelArea } from '../unit/unitAnchor';
import type { PanelStage } from '../unit/UnitWindows';
import { PersonWindow } from './PersonWindow';

const FIRST_WINDOW_POSITION = { x: 80, y: 80 };
const CASCADE_STEP = 12;
const PANEL_FALLBACK_HEIGHT = 200;

/** The part of the stage the fixed panel needs to follow a person on screen. */
export type PersonPanelStage = Pick<PanelStage, 'cssPerDevicePixel' | 'onCameraChange'> & {
  personScreenRect(
    personId: string,
  ): { x: number; y: number; width: number; height: number } | null;
  showPersonSelection?(personId: string | null): void;
  showPersonPath?(path: readonly { level: number; x: number }[]): void;
};

interface PersonWindowsProps {
  connection: GameConnection;
  onCenter: (point: { x: number; y: number }) => void;
  stage?: PersonPanelStage | null;
}

/**
 * Shows the fixed panel of the selected person next to them, and opens a person
 * window when a list asks for one for somebody who is not on screen. The unit
 * windows host tells the server to inspect it, like every open window.
 */
export function PersonWindows({ connection, onCenter, stage = null }: PersonWindowsProps) {
  const manager = useWindowManager();
  const personWindows = manager.stack.windows.filter(
    (window) => window.kind === PERSON_WINDOW_KIND,
  );
  const { inspect } = connection;
  const [anchoredId, setAnchoredId] = useState(() => inspect.anchoredPerson());
  const managerRef = useRef(manager);
  managerRef.current = manager;
  const anchoredRef = useRef(anchoredId);
  anchoredRef.current = anchoredId;

  useEffect(() => {
    setAnchoredId(inspect.anchoredPerson());
    return inspect.onAnchorChange(() => setAnchoredId(inspect.anchoredPerson()));
  }, [inspect]);

  const placePanel = (): Point | null => {
    const personId = anchoredRef.current;
    const current = managerRef.current;
    const rect = personId === null ? null : (stage?.personScreenRect(personId) ?? null);
    if (personId === null || rect === null || stage === null) {
      return null;
    }
    const canvas = document.querySelector('.stage-host canvas')?.getBoundingClientRect();
    const scale = stage.cssPerDevicePixel();
    const frame = document.querySelector<HTMLElement>(
      `[data-window-id="${personPanelId(personId)}"]`,
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

  const followPerson = (): void => {
    const personId = anchoredRef.current;
    const position = placePanel();
    if (personId === null || position === null) {
      return;
    }
    const open = findWindow(managerRef.current.stack, personPanelId(personId));
    if (open !== undefined && (open.position.x !== position.x || open.position.y !== position.y)) {
      managerRef.current.move(personPanelId(personId), position);
    }
  };

  useEffect(() => {
    if (anchoredId === null) {
      return;
    }
    const id = personPanelId(anchoredId);
    managerRef.current.open({
      id,
      kind: PERSON_PANEL_KIND,
      position: placePanel() ?? FIRST_WINDOW_POSITION,
    });
    return () => managerRef.current.close(id);
  }, [anchoredId]);

  useEffect(() => {
    if (anchoredId === null) {
      return;
    }
    const stopCamera = stage?.onCameraChange(followPerson);
    const stopInspect = inspect.subscribe(followPerson);
    const stopSnapshots = connection.store.subscribe(followPerson);
    const onPointerDown = (event: PointerEvent): void => {
      if (!isInsidePanelArea(event.target, personPanelId(anchoredId))) {
        inspect.clearAnchor();
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      stopCamera?.();
      stopInspect();
      stopSnapshots();
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [anchoredId, stage, inspect, connection]);

  // The panel changes size when its data arrives, and the view can be resized.
  useEffect(followPerson);

  // Frame the selected person; the stage keeps the frame on them as they move.
  useEffect(() => {
    stage?.showPersonSelection?.(anchoredId);
    return () => stage?.showPersonSelection?.(null);
  }, [stage, anchoredId]);

  // Draw the route of the selected person; each inspect answer brings it planned anew.
  useEffect(() => {
    if (anchoredId === null || !stage?.showPersonPath) {
      return;
    }
    const showPath = (): void => {
      const data = inspect.person(anchoredId);
      stage.showPersonPath?.(data?.status === 'ok' ? (data.path ?? []) : []);
    };
    showPath();
    const stop = inspect.subscribe(showPath);
    return () => {
      stop();
      stage.showPersonPath?.([]);
    };
  }, [stage, anchoredId, inspect]);

  useEffect(
    () =>
      inspect.onPersonWindowRequest((personId) => {
        // Somebody on screen gets the panel beside them; anybody else gets a window.
        if (stage?.personScreenRect(personId) != null) {
          inspect.anchorPerson(personId);
          return;
        }
        const current = managerRef.current;
        const offset = (current.stack.openCount % 4) * CASCADE_STEP;
        current.open({
          id: personWindowId(personId),
          kind: PERSON_WINDOW_KIND,
          position: { x: FIRST_WINDOW_POSITION.x + offset, y: FIRST_WINDOW_POSITION.y + offset },
        });
      }),
    [inspect, stage],
  );

  return (
    <>
      {personWindows.map((window) => (
        <PersonWindow
          key={window.id}
          personId={entityOfWindow(window.id)}
          connection={connection}
          onCenter={onCenter}
        />
      ))}
      {anchoredId !== null && (
        <PersonWindow
          key={personPanelId(anchoredId)}
          personId={anchoredId}
          connection={connection}
          onCenter={onCenter}
          anchored
        />
      )}
    </>
  );
}
