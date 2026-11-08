import { useCallback, useRef, useState } from 'preact/hooks';
import type { CommandOutcome } from '../../api/commandApi';
import { errorText } from '../strings';
import { formatMoney } from '../money';
import type { ScreenPoint } from './bindBuildInput';

export const TOAST_MS = 3000;
export const FLOAT_MS = 1200;

export interface Toast {
  id: number;
  text: string;
}

export interface FloatingCost {
  id: number;
  text: string;
  kind: 'cost' | 'refund';
  at: ScreenPoint;
}

/** Toasts for refused commands and floating costs for accepted ones. */
export function useBuildFeedback() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [floats, setFloats] = useState<FloatingCost[]>([]);
  const nextId = useRef(0);

  const showFloat = useCallback((float: FloatingCost): void => {
    setFloats((list) => [...list, float]);
    setTimeout(() => setFloats((list) => list.filter((item) => item.id !== float.id)), FLOAT_MS);
  }, []);

  const report = useCallback(
    (outcome: CommandOutcome, at: ScreenPoint): void => {
      nextId.current += 1;
      const id = nextId.current;
      if (outcome.ok) {
        if (outcome.cost > 0) {
          showFloat({ id, text: formatMoney(-outcome.cost), kind: 'cost', at });
        } else if (outcome.refund > 0) {
          showFloat({ id, text: `+${formatMoney(outcome.refund)}`, kind: 'refund', at });
        }
        return;
      }
      setToasts((list) => [...list, { id, text: errorText(outcome.error) }]);
      setTimeout(() => setToasts((list) => list.filter((item) => item.id !== id)), TOAST_MS);
    },
    [showFloat],
  );

  return { toasts, floats, report };
}
