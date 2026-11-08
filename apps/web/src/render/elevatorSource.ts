import type { ShaftView } from '@tower-magnate/shared';
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

/** Feeds `show` with the shafts whenever a delta adds, changes or removes one. */
export function bindShafts(
  store: ClientStore,
  show: (shafts: Iterable<ShaftView>) => void,
): () => void {
  return store.select(
    (state) => ({ shafts: state.shafts }),
    (selected) => show(selected.shafts.values()),
  );
}
