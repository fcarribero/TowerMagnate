import type { Command } from '@tower-magnate/shared';
import type { CommandApi, CommandOutcome } from '../../api/commandApi';
import type { Cell } from '../../render/cellAtPoint';
import type { Footprint } from '../../render/ghostLayer';
import { indexToLevel, levelToIndex } from '../../render/levels';
import type { CellInput } from '../../render/stage';
import type { ScreenPoint } from './bindBuildInput';
import {
  combineOutcomes,
  floorRunConfirmation,
  pickDemolition,
  runCommands,
  unlistCommands,
  runFootprint,
  singleUnitConfirmation,
  unitAt,
  unitFootprint,
  unitsConfirmation,
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
  showHighlight(highlight: Footprint | readonly Footprint[] | null, color?: number): void;
}

export interface DemolishInputOptions {
  stage: DemolishStage;
  api: Pick<CommandApi, 'send'>;
  /** The tower as the client last saw it; null before the first snapshot. */
  world: () => DemolishWorld | null;
  /** Calls the listener when the tower changes, so the frame follows what is still there. */
  watchWorld?: (listener: () => void) => () => void;
  /**
   * Called when a demolition needs a yes; `proceed` sends the command. `keepContract` is given
   * for rented units still listed: it unlists them and sends no demolition.
   */
  confirm: (confirmation: Confirmation, proceed: () => void, keepContract?: () => void) => void;
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

/** A press that started on a unit: every unit the pointer crosses joins it until the release. */
interface UnitSweep {
  ids: string[];
  last: Cell;
}

/** The cells on a straight line between two cells, both ends included, so a fast drag skips none. */
export function cellsBetween(from: Cell, to: Cell): Cell[] {
  const fromIndex = levelToIndex(from.level);
  const toIndex = levelToIndex(to.level);
  const steps = Math.max(Math.abs(to.x - from.x), Math.abs(toIndex - fromIndex));
  const cells: Cell[] = [];
  for (let step = 0; step <= steps; step += 1) {
    const t = steps === 0 ? 0 : step / steps;
    cells.push({
      x: Math.round(from.x + (to.x - from.x) * t),
      level: indexToLevel(Math.round(fromIndex + (toIndex - fromIndex) * t)),
    });
  }
  return cells;
}

/**
 * The Topadora: frames what a click would remove and removes it on the release. A press on a
 * unit sweeps up every unit the pointer crosses while the button is held; on the release one
 * unit goes at once (a lease still asks about the indemnity) and several ask for a yes first.
 * A press on floor, lobby or ruins removes a run along one level. Esc or a right click drops
 * the press without sending anything.
 */
export function bindDemolishInput(options: DemolishInputOptions): () => void {
  const { stage, api, world, confirm, onOutcome } = options;
  const pause = options.pause ?? waitMs;
  const keyTarget = options.keyTarget ?? window;
  let hovered: Cell | null = null;
  let drag: RunDrag | null = null;
  let sweep: UnitSweep | null = null;
  let pending: DemolishPick | null = null;
  let batches = 0;

  const pickAt = (cell: Cell | null): DemolishPick | null => {
    const current = world();
    return cell === null || current === null ? null : pickDemolition(current, cell);
  };

  const send = (command: Command, at: ScreenPoint): void => {
    void api.send(command).then((outcome) => onOutcome(outcome, command, at));
  };

  const sendPaced = async (commands: readonly Command[]): Promise<CommandOutcome[]> => {
    const outcomes: CommandOutcome[] = [];
    batches += 1;
    const batch = `demolish-run-${batches}`;
    for (let start = 0; start < commands.length; start += RUN_CHUNK_SIZE) {
      if (start > 0) {
        await pause(RUN_CHUNK_INTERVAL_MS);
      }
      const chunk = commands.slice(start, start + RUN_CHUNK_SIZE);
      outcomes.push(...(await Promise.all(chunk.map((command) => api.send(command, { batch })))));
    }
    return outcomes;
  };

  const sweptUnits = () => {
    const current = world();
    if (sweep === null || current === null) {
      return [];
    }
    const byId = new Map([...current.units].map((unit) => [unit.id, unit]));
    return sweep.ids.flatMap((id) => {
      const unit = byId.get(id);
      return unit === undefined ? [] : [unit];
    });
  };

  const frame = (): void => {
    if (sweep !== null) {
      stage.showHighlight(sweptUnits().map(unitFootprint), DEMOLISH_COLOR);
      return;
    }
    if (pending !== null) {
      stage.showHighlight(pending.footprint, DEMOLISH_COLOR);
      return;
    }
    if (drag !== null) {
      const { press, currentX } = drag;
      stage.showHighlight(runFootprint(press.level, press.x, currentX), DEMOLISH_COLOR);
      return;
    }
    stage.showHighlight(pickAt(hovered)?.footprint ?? null, DEMOLISH_COLOR);
  };

  const cancelDrag = (): void => {
    drag = null;
    sweep = null;
    pending = null;
    frame();
  };

  const sendAll = (commands: readonly Command[], at: ScreenPoint): void => {
    const [first, ...rest] = commands;
    if (first === undefined) {
      return;
    }
    if (rest.length === 0) {
      send(first, at);
      return;
    }
    void sendPaced(commands).then((outcomes) => onOutcome(combineOutcomes(outcomes), first, at));
  };

  const askFor = (confirmation: Confirmation, commands: readonly Command[], at: ScreenPoint): void => {
    const unlist = unlistCommands(confirmation);
    confirm(
      confirmation,
      () => sendAll(commands, at),
      unlist.length === 0
        ? undefined
        : () => {
            for (const unlistCommand of unlist) {
              send(unlistCommand, at);
            }
          },
    );
  };

  const press = (cell: Cell): void => {
    const pick = pickAt(cell);
    if (pick === null) {
      return;
    }
    if (pick.run !== null) {
      drag = { kind: pick.run, press: cell, currentX: cell.x };
    } else if (pick.command.type === 'demolish' && pick.command.target.kind === 'unit') {
      sweep = { ids: [pick.command.target.id], last: cell };
    } else {
      pending = pick;
    }
    frame();
  };

  const extendSweep = (cell: Cell): void => {
    const current = world();
    if (sweep === null || current === null) {
      return;
    }
    const ids = new Set(sweep.ids);
    for (const crossed of cellsBetween(sweep.last, cell)) {
      const unit = unitAt(current, crossed);
      if (unit !== null && !ids.has(unit.id)) {
        ids.add(unit.id);
      }
    }
    sweep = { ids: [...ids], last: cell };
  };

  const releaseSweep = (at: ScreenPoint): void => {
    const units = sweptUnits();
    cancelDrag();
    const commands: Command[] = units.map((unit) => ({
      type: 'demolish',
      target: { kind: 'unit', id: unit.id },
    }));
    const only = units.length === 1 ? units[0] : undefined;
    const confirmation =
      only !== undefined ? singleUnitConfirmation(only) : unitsConfirmation(units);
    if (confirmation !== null) {
      askFor(confirmation, commands, at);
    } else {
      sendAll(commands, at);
    }
  };

  const releasePending = (at: ScreenPoint): void => {
    const pick = pending;
    cancelDrag();
    if (pick === null) {
      return;
    }
    if (pick.confirmation !== null) {
      askFor(pick.confirmation, [pick.command], at);
    } else {
      send(pick.command, at);
    }
  };

  const release = (cell: Cell | null, at: ScreenPoint): void => {
    if (sweep !== null) {
      if (cell !== null) {
        extendSweep(cell);
      }
      releaseSweep(at);
      return;
    }
    if (pending !== null) {
      releasePending(at);
      return;
    }
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
    const current = world();
    const confirmation =
      kind === 'floor' && current !== null
        ? floorRunConfirmation(current, start.level, start.x, cell?.x ?? currentX)
        : null;
    if (confirmation !== null) {
      askFor(confirmation, [first], at);
      return;
    }
    sendAll([first, ...rest], at);
  };

  const onInput = (input: CellInput): void => {
    const at = { x: input.clientX, y: input.clientY };
    if (input.kind === 'cancel') {
      cancelDrag();
    } else if (input.kind === 'down' && input.cell !== null) {
      press(input.cell);
    } else if (input.kind === 'up') {
      release(input.cell, at);
    }
  };

  const onHover = (cell: Cell | null): void => {
    hovered = cell;
    if (sweep !== null && cell !== null) {
      extendSweep(cell);
    }
    if (drag !== null && cell !== null) {
      drag = { ...drag, currentX: cell.x };
    }
    frame();
  };

  const onKeyDown = (event: Event): void => {
    const pressed = drag !== null || sweep !== null || pending !== null;
    if ((event as KeyboardEvent).key === 'Escape' && pressed) {
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
    sweep = null;
    pending = null;
    stage.showHighlight(null);
  };
}
