import {
  SHAFT_UNIT_TYPES,
  UNIT_CATALOG,
  type Command,
  type ShaftType,
  type UnitType,
} from '@tower-magnate/shared';
import type { CommandApi, CommandOutcome } from '../../api/commandApi';
import type { Cell } from '../../render/cellAtPoint';
import type { CellInput } from '../../render/stage';
import type { RunInput } from '../../render/ghostLayer';
import {
  checkFloor,
  checkLobby,
  checkPlacement,
  checkShaft,
  type PlacementWorld,
} from '../../render/placementCheck';
import type { ToolId } from '../toolbar/toolbarModel';
import {
  adjacentSlots,
  buildMode,
  repeatsOnDrag,
  slotIndex,
  commandForResize,
  commandForClick,
  commandForDrag,
  commandForShaftDrag,
  resizedSpan,
  type GrabbedShaft,
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
  /** The shaft covering the cell and the end of it nearest the cell, if any. */
  shaftAt?: (cell: Cell) => GrabbedShaft | null;
  /** The height already fixed on that level, if a lobby stands there. */
  lobbyHeightAt?: (level: Cell['level']) => number | null;
  /** The tower as the client knows it; with it a drag shows green only when the server would build it. */
  worldAt?: () => PlacementWorld | null;
  onOutcome(outcome: CommandOutcome, command: Command, at: ScreenPoint): void;
  /** A right click: the drag in progress is dropped and the player is done with this structure. */
  onCancelTool?: () => void;
  /** Floors and cost that follow the pointer while a shaft is dragged; null when there is no drag. */
  onDragLabel?: (label: DragLabel | null) => void;
  /** Waits between chunks of a long held drag; replaceable in tests. */
  pause?: (ms: number) => Promise<void>;
  keyTarget?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
}

export interface DragLabel {
  floors: number;
  cost: number;
  valid: boolean;
  at: ScreenPoint;
}

/** A unit tool held down: the slots built so far, counted from the pressed one, and those still to send. */
interface ClickRun {
  pressX: number;
  level: Cell['level'];
  width: number;
  built: { min: number; max: number };
  held: boolean;
  stopped: boolean;
  queue: number[];
  pumping: boolean;
  batch: string;
  sent: number;
  at: ScreenPoint;
}

/** Under the server limit of 30 messages per second, as in the demolish run. */
const RUN_CHUNK_SIZE = 20;
const RUN_CHUNK_INTERVAL_MS = 1000;
const waitMs = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

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
  const { shaftAt, lobbyHeightAt, worldAt, onDragLabel } = options;
  const keyTarget = options.keyTarget ?? window;
  const mode = buildMode(tool);
  const shaftType = shaftTypeOfTool(tool);
  const pause = options.pause ?? waitMs;
  let run: ClickRun | null = null;
  let batches = 0;
  let drag: Drag | null = null;
  let grabbed: GrabbedShaft | null = null;
  let pointer: ScreenPoint = { x: 0, y: 0 };

  const send = (command: Command | null, at: ScreenPoint): void => {
    if (command === null) {
      return;
    }
    void api.send(command).then((outcome) => onOutcome(outcome, command, at));
  };

  const showDrag = (): void => {
    if (grabbed !== null && drag !== null) {
      showHandDrag(grabbed, drag.currentLevel);
      return;
    }
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
    const world = worldAt?.() ?? null;
    const level = drag.press.level;
    const problem =
      world === null
        ? null
        : tool === 'lobby'
          ? checkLobby(level, x0, x1, lobbyHeightAt?.(level) ?? lobbyHeight, world)
          : checkFloor(level, x0, x1, world);
    stage.showRun({ x: x0, level, width: x1 - x0 + 1, floors: 1, valid: problem === null });
  };

  const showShaftDrag = (current: Drag, type: ShaftType): void => {
    const { bottom, top, floors } = shaftSpan(current.press.level, current.currentLevel);
    const maxFloors = shaftMaxFloors(type);
    const world = worldAt?.() ?? null;
    const valid =
      world === null
        ? maxFloors === null || floors <= maxFloors
        : checkShaft(type, current.press.x, bottom, top, world) === null;
    const width = UNIT_CATALOG[SHAFT_UNIT_TYPES[type]].width;
    stage.showRun({ x: current.press.x, level: bottom, width, floors, valid });
    onDragLabel?.({ floors, cost: shaftCost(type), valid, at: pointer });
  };

  /** The shaft as it would be with the grabbed end let go here; red when it is too tall or flipped. */
  const showHandDrag = (shaft: GrabbedShaft, level: Cell['level']): void => {
    const span = resizedSpan(shaft, level);
    const maxFloors = shaftMaxFloors(shaft.type);
    const shown = span ?? shaftSpan(shaft.bottom, shaft.top);
    const world = worldAt?.() ?? null;
    const valid =
      span !== null &&
      (world === null
        ? maxFloors === null || span.floors <= maxFloors
        : checkShaft(shaft.type, shaft.x, span.bottom, span.top, world, shaft.id) === null);
    const width = UNIT_CATALOG[SHAFT_UNIT_TYPES[shaft.type]].width;
    stage.showRun({ x: shaft.x, level: shown.bottom, width, floors: shown.floors, valid });
  };

  const cancelDrag = (): void => {
    drag = null;
    grabbed = null;
    showDrag();
  };

  const stopRun = (): void => {
    if (run !== null) {
      run.stopped = true;
      run.queue = [];
      run.held = false;
      run = null;
    }
  };

  /** Sends the queued slots one after another, stopping at the first one that is red or refused. */
  const pump = async (r: ClickRun): Promise<void> => {
    if (r.pumping) {
      return;
    }
    r.pumping = true;
    while (!r.stopped) {
      const x = r.queue.shift();
      if (x === undefined) {
        break;
      }
      const world = worldAt?.() ?? null;
      if (world !== null && checkPlacement(tool as UnitType, x, r.level, world).problem !== null) {
        r.stopped = true;
        break;
      }
      if (r.sent > 0 && r.sent % RUN_CHUNK_SIZE === 0) {
        await pause(RUN_CHUNK_INTERVAL_MS);
        if (r.stopped) {
          break;
        }
      }
      const command = commandForClick(tool, { x, level: r.level });
      if (command === null) {
        break;
      }
      r.sent += 1;
      const outcome = await api.send(command, { batch: r.batch });
      onOutcome(outcome, command, r.at);
      if (!outcome.ok) {
        r.stopped = true;
      }
    }
    r.pumping = false;
    if (!r.held && run === r) {
      run = null;
    }
  };

  const extendRun = (cell: Cell | null): void => {
    const r = run;
    if (r === null || !r.held || r.stopped || cell === null || cell.level !== r.level) {
      return;
    }
    const xs = adjacentSlots(r.pressX, cell.x, r.width, r.built);
    if (xs.length === 0) {
      return;
    }
    const target = slotIndex(r.pressX, cell.x, r.width);
    r.built.min = Math.min(r.built.min, target);
    r.built.max = Math.max(r.built.max, target);
    r.queue.push(...xs);
    void pump(r);
  };

  const pressUnit = (cell: Cell, at: ScreenPoint): void => {
    const command = commandForClick(tool, cell);
    if (command === null) {
      return;
    }
    stopRun();
    batches += 1;
    const r: ClickRun = {
      pressX: cell.x,
      level: cell.level,
      width: UNIT_CATALOG[tool as UnitType].width,
      built: { min: 0, max: 0 },
      held: true,
      stopped: false,
      queue: [],
      pumping: true,
      batch: `build-run-${batches}`,
      sent: 1,
      at,
    };
    run = r;
    void api.send(command, { batch: r.batch }).then((outcome) => {
      onOutcome(outcome, command, at);
      if (!outcome.ok) {
        r.stopped = true;
        r.queue = [];
      }
      r.pumping = false;
      if (r.queue.length > 0 && !r.stopped) {
        void pump(r);
      } else if (!r.held && run === r) {
        run = null;
      }
    });
  };

  const onInput = (input: CellInput): void => {
    const at = { x: input.clientX, y: input.clientY };
    if (input.kind === 'cancel') {
      cancelDrag();
      stopRun();
      options.onCancelTool?.();
    } else if (input.kind === 'down' && input.cell !== null) {
      pointer = at;
      if (mode === 'drag' || mode === 'shaft') {
        drag = { press: input.cell, currentX: input.cell.x, currentLevel: input.cell.level };
        showDrag();
      } else if (mode === 'hand') {
        grabbed = shaftAt?.(input.cell) ?? null;
        if (grabbed !== null) {
          drag = { press: input.cell, currentX: input.cell.x, currentLevel: input.cell.level };
          showDrag();
        }
      } else if (mode === 'click') {
        if (repeatsOnDrag(tool)) {
          pressUnit(input.cell, at);
        } else {
          send(commandForClick(tool, input.cell), at);
        }
      }
    } else if (input.kind === 'up' && run !== null && drag === null) {
      extendRun(input.cell);
      if (run !== null) {
        run.held = false;
        if (!run.pumping) {
          run = null;
        }
      }
    } else if (input.kind === 'up' && drag !== null) {
      const { press, currentX, currentLevel } = drag;
      const hand = grabbed;
      cancelDrag();
      const command =
        mode === 'hand'
          ? hand === null
            ? null
            : commandForResize(hand, input.cell?.level ?? currentLevel)
          : mode === 'shaft'
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
    extendRun(cell);
    if (drag !== null && cell !== null) {
      drag = { ...drag, currentX: cell.x, currentLevel: cell.level };
      showDrag();
    }
  };

  const onKeyDown = (event: Event): void => {
    if ((event as KeyboardEvent).key === 'Escape' && (drag !== null || run !== null)) {
      event.preventDefault();
      cancelDrag();
      stopRun();
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
    stopRun();
  };
}
