import { useCallback, useRef, useState } from 'preact/hooks';
import type { CommandOutcome } from '../../api/commandApi';
import { showToast } from '../kit';
import { errorText } from '../strings';
import { formatMoney } from '../money';
import type { ScreenPoint } from './bindBuildInput';

export const FLOAT_MS = 1000;

export interface FloatingCost {
  id: number;
  text: string;
  kind: 'cost' | 'refund';
  at: ScreenPoint;
}

/** Toast for refused commands and floating costs for accepted ones. */
export function useBuildFeedback() {
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
      showToast(errorText(outcome.error));
    },
    [showFloat],
  );

  return { floats, report };
}
