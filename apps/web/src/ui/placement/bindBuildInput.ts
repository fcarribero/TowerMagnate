import {
  SHAFT_UNIT_TYPES,
  UNIT_CATALOG,
  type Command,
  type ShaftType,
} from '@tower-magnate/shared';
import type { CommandApi, CommandOutcome } from '../../api/commandApi';
import type { Cell } from '../../render/cellAtPoint';
import type { CellInput } from '../../render/stage';
import type { RunInput } from '../../render/ghostLayer';
import type { ToolId } from '../toolbar/toolbarModel';
import {
  buildMode,
  commandForCar,
  commandForClick,
  commandForDrag,
  commandForShaftDrag,
  shaftCost,
  shaftMaxFloors,
  shaftSpan,
  shaftTypeOfTool,
} from './buildPlan';

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface BuildStage {
  onCellInput(listener: (input: CellInput) => void): () => void;
  onHoverCell(listener: (cell: Cell | null) => void): () => void;
  showRun(run: RunInput | null): void;
}

export interface BuildInputOptions {
  stage: BuildStage;
  api: Pick<CommandApi, 'send'>;
  tool: ToolId;
  lobbyHeight: number;
  /** The id of the shaft covering the cell, if any. */
  shaftAt?: (cell: Cell) => string | null;
  /** The height already fixed on that level, if a lobby stands there. */
  lobbyHeightAt?: (level: Cell['level']) => number | null;
  onOutcome(outcome: CommandOutcome, command: Command, at: ScreenPoint): void;
  /** Floors and cost that follow the pointer while a shaft is dragged; null when there is no drag. */
  onDragLabel?: (label: DragLabel | null) => void;
  keyTarget?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
}

export interface DragLabel {
  floors: number;
  cost: number;
  at: ScreenPoint;
}

interface Drag {
  press: Cell;
  currentX: number;
  currentLevel: Cell['level'];
}

/**
 * Turns presses, drags and releases on the tower into build commands for the
 * selected tool. Esc or a right click drops a drag without sending anything.
 */
export function bindBuildInput(options: BuildInputOptions): () => void {
  const { stage, api, tool, lobbyHeight, onOutcome } = options;
  const { shaftAt, lobbyHeightAt, onDragLabel } = options;
  const keyTarget = options.keyTarget ?? window;
  const mode = buildMode(tool);
  const shaftType = shaftTypeOfTool(tool);
  let drag: Drag | null = null;
  let pointer: ScreenPoint = { x: 0, y: 0 };

  const send = (command: Command | null, at: ScreenPoint): void => {
    if (command === null) {
      return;
    }
    void api.send(command).then((outcome) => onOutcome(outcome, command, at));
  };

  const showDrag = (): void => {
    if (drag === null) {
      stage.showRun(null);
      onDragLabel?.(null);
      return;
    }
    if (shaftType !== null) {
      showShaftDrag(drag, shaftType);
      return;
    }
    const x0 = Math.min(drag.press.x, drag.currentX);
    const x1 = Math.max(drag.press.x, drag.currentX);
    stage.showRun({ x: x0, level: drag.press.level, width: x1 - x0 + 1, floors: 1, valid: true });
  };

  const showShaftDrag = (current: Drag, type: ShaftType): void => {
    const { bottom, floors } = shaftSpan(current.press.level, current.currentLevel);
    const maxFloors = shaftMaxFloors(type);
    const valid = maxFloors === null || floors <= maxFloors;
    const width = UNIT_CATALOG[SHAFT_UNIT_TYPES[type]].width;
    stage.showRun({ x: current.press.x, level: bottom, width, floors, valid });
    onDragLabel?.({ floors, cost: shaftCost(type), at: pointer });
  };

  const cancelDrag = (): void => {
    drag = null;
    showDrag();
  };

  const onInput = (input: CellInput): void => {
    const at = { x: input.clientX, y: input.clientY };
    if (input.kind === 'cancel') {
      cancelDrag();
    } else if (input.kind === 'down' && input.cell !== null) {
      pointer = at;
      if (mode === 'drag' || mode === 'shaft') {
        drag = { press: input.cell, currentX: input.cell.x, currentLevel: input.cell.level };
        showDrag();
      } else if (mode === 'car') {
        send(commandForCar(shaftAt?.(input.cell) ?? null, input.cell), at);
      } else if (mode === 'click') {
        send(commandForClick(tool, input.cell), at);
      }
    } else if (input.kind === 'up' && drag !== null) {
      const { press, currentX, currentLevel } = drag;
      cancelDrag();
      const command =
        mode === 'shaft'
          ? commandForShaftDrag(tool, press, input.cell?.level ?? currentLevel)
          : commandForDrag(
              tool,
              lobbyHeightAt?.(press.level) ?? lobbyHeight,
              press,
              input.cell?.x ?? currentX,
            );
      send(command, at);
    }
  };

  const onHover = (cell: Cell | null): void => {
    if (drag !== null && cell !== null) {
      drag = { ...drag, currentX: cell.x, currentLevel: cell.level };
      showDrag();
    }
  };

  const onKeyDown = (event: Event): void => {
    if ((event as KeyboardEvent).key === 'Escape' && drag !== null) {
      event.preventDefault();
      cancelDrag();
    }
  };

  const onPointerMove = (event: Event): void => {
    const { clientX, clientY } = event as MouseEvent;
    pointer = { x: clientX, y: clientY };
    if (drag !== null && shaftType !== null) {
      showDrag();
    }
  };

  const stopInput = stage.onCellInput(onInput);
  const stopHover = stage.onHoverCell(onHover);
  keyTarget.addEventListener('keydown', onKeyDown, true);
  keyTarget.addEventListener('pointermove', onPointerMove, true);
  return () => {
    stopInput();
    stopHover();
    keyTarget.removeEventListener('keydown', onKeyDown, true);
    keyTarget.removeEventListener('pointermove', onPointerMove, true);
    cancelDrag();
  };
}
