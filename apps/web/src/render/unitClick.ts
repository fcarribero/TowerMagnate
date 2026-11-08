import type { ClientStore } from '../model/clientStore';
import type { Cell } from './cellAtPoint';
import { unitAt } from './placementCheck';

export interface ClickStage {
  onCellClick(listener: (cell: Cell) => void): () => void;
}

/** With the inspect tool, a click on a unit asks for its window. */
export function bindUnitClicks(
  stage: ClickStage,
  store: ClientStore,
  openUnitWindow: (unitId: string) => void,
): () => void {
  return stage.onCellClick((cell) => {
    const units = store.current?.latest.units.values();
    const unit = units === undefined ? null : unitAt(units, cell.x, cell.level);
    if (unit !== null) {
      openUnitWindow(unit.id);
    }
  });
}
