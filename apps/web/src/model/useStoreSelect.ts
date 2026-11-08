import { useEffect, useState } from 'preact/hooks';
import type { ClientStore } from './clientStore';
import type { GameState } from './gameState';

/**
 * The selected part of the store's latest state, or null before the first
 * snapshot. Re-renders only when the selection changes (shallow compare).
 * Pass a stable selector, defined outside the component.
 */
export function useStoreSelect<T>(store: ClientStore, selector: (state: GameState) => T): T | null {
  const [value, setValue] = useState<{ current: T } | null>(() => {
    const frames = store.current;
    return frames === null ? null : { current: selector(frames.latest) };
  });

  useEffect(() => store.select(selector, (current) => setValue({ current })), [store, selector]);

  return value === null ? null : value.current;
}
