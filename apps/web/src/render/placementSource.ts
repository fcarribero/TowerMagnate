import { UNIT_CATALOG } from '@tower-magnate/shared';
import type { ClientStore } from '../model/clientStore';
import type { GameState } from '../model/gameState';
import type { Cell } from './cellAtPoint';
import type { Footprint, GhostInput } from './ghostLayer';
import type { PlacementWorld } from './placementCheck';
import { planPreview, type PreviewTool } from './placementPreview';
import { timeOfDayAt } from './timeOfDay';

export interface PreviewStage {
  onHoverCell(listener: (cell: Cell | null) => void): () => void;
  showGhost(ghost: GhostInput | null): void;
  showHighlight(highlight: Footprint | null): void;
}

export function worldOf(state: GameState): PlacementWorld {
  return {
    structure: state.structure,
    units: state.units.values(),
    transports: state.transports.values(),
    shafts: state.shafts.values(),
  };
}

/** Maps a toolbar tool id to what the preview needs: unit tools build, `inspect` frames units. */
export function previewToolOf(tool: string): PreviewTool {
  if (tool === 'inspect') {
    return { kind: 'inspect' };
  }
  if (Object.hasOwn(UNIT_CATALOG, tool)) {
    return { kind: 'build', type: tool as keyof typeof UNIT_CATALOG };
  }
  return { kind: 'none' };
}

/**
 * Keeps the ghost and the hover frame in step with the pointer, the selected
 * tool and the client's copy of the tower, so a delta that fills the spot
 * under the ghost turns it red on the next frame.
 */
export function bindPreview(
  stage: PreviewStage,
  store: ClientStore,
  tool: PreviewTool,
): () => void {
  let cell: Cell | null = null;

  const redraw = (): void => {
    const state = store.current?.latest;
    if (state === undefined) {
      stage.showGhost(null);
      stage.showHighlight(null);
      return;
    }
    const preview = planPreview(tool, cell, worldOf(state), timeOfDayAt(state.step));
    stage.showGhost(preview.ghost);
    stage.showHighlight(preview.highlight);
  };

  const stopHover = stage.onHoverCell((next) => {
    cell = next;
    redraw();
  });
  const stopStore = store.select(
    (state) => ({
      structure: state.structure,
      units: state.units,
      transports: state.transports,
      shafts: state.shafts,
    }),
    redraw,
  );
  redraw();
  return () => {
    stopHover();
    stopStore();
    stage.showGhost(null);
    stage.showHighlight(null);
  };
}
