import { useEffect, useRef, useState } from 'preact/hooks';
import type { GameConnection } from '../../net/gameConnection';
import type { Stage } from '../../render/stage';
import { INCOME_FLOAT_MS, incomeFloaters, type IncomeFloater } from './incomeEvents';

export interface ShownFloater extends IncomeFloater {
  id: number;
}

/** Floating income amounts over the units that earned them, while those units are on screen. */
export function useIncomeFloaters(stage: Stage | null, connection: GameConnection): ShownFloater[] {
  const [floaters, setFloaters] = useState<ShownFloater[]>([]);
  const nextId = useRef(0);

  useEffect(() => {
    if (stage === null) {
      return;
    }
    return connection.onMessage((message) => {
      if (message.t !== 'events') {
        return;
      }
      const canvasRect = document.querySelector('.stage-host canvas')?.getBoundingClientRect();
      const fresh = incomeFloaters(message.p.events, {
        unitRect: (unitId) => stage.unitScreenRect(unitId),
        cssPerDevicePixel: stage.cssPerDevicePixel(),
        canvasOrigin: { x: canvasRect?.left ?? 0, y: canvasRect?.top ?? 0 },
      }).map((floater) => ({ ...floater, id: (nextId.current += 1) }));
      if (fresh.length === 0) {
        return;
      }
      setFloaters((list) => [...list, ...fresh]);
      const ids = new Set(fresh.map((floater) => floater.id));
      setTimeout(
        () => setFloaters((list) => list.filter((item) => !ids.has(item.id))),
        INCOME_FLOAT_MS,
      );
    });
  }, [stage, connection]);

  return floaters;
}
