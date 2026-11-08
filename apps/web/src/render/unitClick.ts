import type { ClientStore } from '../model/clientStore';
import type { Cell } from './cellAtPoint';
import { unitAt } from './placementCheck';

export interface ClickStage {
  onCellInput(
    listener: (input: {
      kind: 'down' | 'up' | 'cancel';
      cell: Cell | null;
      clientX: number;
      clientY: number;
    }) => void,
  ): () => void;
}

/** A press that moves farther than this many CSS pixels is a drag, not a click. */
const CLICK_MOVE_LIMIT = 4;

/** With the inspect tool, a click on a unit asks for its window. */
export function bindUnitClicks(
  stage: ClickStage,
  store: ClientStore,
  openUnitWindow: (unitId: string) => void,
): () => void {
  let press: { clientX: number; clientY: number } | null = null;
  return stage.onCellInput((input) => {
    if (input.kind === 'down') {
      press = { clientX: input.clientX, clientY: input.clientY };
      return;
    }
    const started = press;
    press = null;
    if (input.kind !== 'up' || started === null || input.cell === null) {
      return;
    }
    const moved = Math.hypot(input.clientX - started.clientX, input.clientY - started.clientY);
    if (moved > CLICK_MOVE_LIMIT) {
      return;
    }
    const units = store.current?.latest.units.values();
    const unit = units === undefined ? null : unitAt(units, input.cell.x, input.cell.level);
    if (unit !== null) {
      openUnitWindow(unit.id);
    }
  });
}
