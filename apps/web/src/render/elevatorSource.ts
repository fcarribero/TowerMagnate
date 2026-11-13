import type { Level, ShaftView } from '@tower-magnate/shared';
import type { ClientStore } from '../model/clientStore';
import { drawnFrame, progressSince } from '../model/interpolation';
import type { CarSource } from './stage';

/** The cars and riders to draw now, between the two latest deltas, or null before the first snapshot. */
export function carSourceOf(
  store: ClientStore,
  now: () => number = () => performance.now(),
): CarSource {
  return () => {
    const frames = store.current;
    if (frames === null) {
      return null;
    }
    const progress = progressSince(frames.latestArrivedAtMs, now());
    return { frame: drawnFrame(frames, progress), shafts: frames.latest.shafts };
  };
}

/** Feeds `show` with the shafts and the tower structure whenever either changes. */
export function bindShafts(
  store: ClientStore,
  show: (shafts: Iterable<ShaftView>, structure: ReadonlyMap<Level, string>) => void,
): () => void {
  return store.select(
    (state) => ({ shafts: state.shafts, structure: state.structure }),
    (selected) => show(selected.shafts.values(), selected.structure),
  );
}
