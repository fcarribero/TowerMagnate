import type { Command } from '@tower-magnate/shared';
import type { CommandApi, CommandOutcome } from '../../api/commandApi';
import type { Cell } from '../../render/cellAtPoint';
import type { Footprint } from '../../render/ghostLayer';
import type { CellInput } from '../../render/stage';
import type { ScreenPoint } from './bindBuildInput';
import {
  combineOutcomes,
  pickDemolition,
  runCommands,
  runFootprint,
  type Confirmation,
  type DemolishPick,
  type DemolishWorld,
  type RunKind,
} from './demolishPlan';

export const DEMOLISH_COLOR = 0xb0353a;

/** Under the server limit of 30 messages per second, leaving room for other commands. */
export const RUN_CHUNK_SIZE = 20;
export const RUN_CHUNK_INTERVAL_MS = 1000;

const waitMs = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface DemolishStage {
  onCellInput(listener: (input: CellInput) => void): () => void;
  onHoverCell(listener: (cell: Cell | null) => void): () => void;
  showHighlight(highlight: Footprint | null, color?: number): void;
}

export interface DemolishInputOptions {
  stage: DemolishStage;
  api: Pick<CommandApi, 'send'>;
  /** The tower as the client last saw it; null before the first snapshot. */
  world: () => DemolishWorld | null;
  /** Calls the listener when the tower changes, so the frame follows what is still there. */
  watchWorld?: (listener: () => void) => () => void;
  /** Called when a demolition needs a yes; `proceed` sends the command. */
  confirm: (confirmation: Confirmation, proceed: () => void) => void;
  onOutcome(outcome: CommandOutcome, command: Command, at: ScreenPoint): void;
  /** Waits between chunks of a long run; replaceable in tests. */
  pause?: (ms: number) => Promise<void>;
  keyTarget?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
}

interface RunDrag {
  kind: RunKind;
  press: Cell;
  currentX: number;
}

/**
 * The Topadora: frames what a click would remove, removes it on a press, and
 * removes a run of floor, lobby or ruins when dragged along one level. Esc or a right
 * click drops a drag without sending anything.
 */
export function bindDemolishInput(options: DemolishInputOptions): () => void {
  const { stage, api, world, confirm, onOutcome } = options;
  const pause = options.pause ?? waitMs;
  const keyTarget = options.keyTarget ?? window;
  let hovered: Cell | null = null;
  let drag: RunDrag | null = null;

  const pickAt = (cell: Cell | null): DemolishPick | null => {
    const current = world();
    return cell === null || current === null ? null : pickDemolition(current, cell);
  };

  const send = (command: Command, at: ScreenPoint): void => {
    void api.send(command).then((outcome) => onOutcome(outcome, command, at));
  };

  const sendPaced = async (commands: readonly Command[]): Promise<CommandOutcome[]> => {
    const outcomes: CommandOutcome[] = [];
    for (let start = 0; start < commands.length; start += RUN_CHUNK_SIZE) {
      if (start > 0) {
        await pause(RUN_CHUNK_INTERVAL_MS);
      }
      const chunk = commands.slice(start, start + RUN_CHUNK_SIZE);
      outcomes.push(...(await Promise.all(chunk.map((command) => api.send(command)))));
    }
    return outcomes;
  };

  const frame = (): void => {
    if (drag !== null) {
      const { press, currentX } = drag;
      stage.showHighlight(runFootprint(press.level, press.x, currentX), DEMOLISH_COLOR);
      return;
    }
    stage.showHighlight(pickAt(hovered)?.footprint ?? null, DEMOLISH_COLOR);
  };

  const cancelDrag = (): void => {
    drag = null;
    frame();
  };

  const press = (cell: Cell, at: ScreenPoint): void => {
    const pick = pickAt(cell);
    if (pick === null) {
      return;
    }
    if (pick.run !== null) {
      drag = { kind: pick.run, press: cell, currentX: cell.x };
      frame();
    } else if (pick.confirmation !== null) {
      confirm(pick.confirmation, () => send(pick.command, at));
    } else {
      send(pick.command, at);
    }
  };

  const release = (cell: Cell | null, at: ScreenPoint): void => {
    if (drag === null) {
      return;
    }
    const { kind, press: start, currentX } = drag;
    cancelDrag();
    const row = world()?.structure.get(start.level) ?? '';
    const [first, ...rest] = runCommands(kind, start.level, row, start.x, cell?.x ?? currentX);
    if (first === undefined) {
      return;
    }
    if (rest.length === 0) {
      send(first, at);
      return;
    }
    void sendPaced([first, ...rest]).then((outcomes) =>
      onOutcome(combineOutcomes(outcomes), first, at),
    );
  };

  const onInput = (input: CellInput): void => {
    const at = { x: input.clientX, y: input.clientY };
    if (input.kind === 'cancel') {
      cancelDrag();
    } else if (input.kind === 'down' && input.cell !== null) {
      press(input.cell, at);
    } else if (input.kind === 'up') {
      release(input.cell, at);
    }
  };

  const onHover = (cell: Cell | null): void => {
    hovered = cell;
    if (drag !== null && cell !== null) {
      drag = { ...drag, currentX: cell.x };
    }
    frame();
  };

  const onKeyDown = (event: Event): void => {
    if ((event as KeyboardEvent).key === 'Escape' && drag !== null) {
      event.preventDefault();
      cancelDrag();
    }
  };

  const stopInput = stage.onCellInput(onInput);
  const stopHover = stage.onHoverCell(onHover);
  const stopWorld = options.watchWorld?.(frame);
  keyTarget.addEventListener('keydown', onKeyDown, true);
  frame();
  return () => {
    stopInput();
    stopHover();
    stopWorld?.();
    keyTarget.removeEventListener('keydown', onKeyDown, true);
    drag = null;
    stage.showHighlight(null);
  };
}
