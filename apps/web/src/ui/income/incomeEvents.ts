import type { ClientEvent } from '@tower-magnate/shared';
import { formatMoney } from '../money';

export const INCOME_FLOAT_MS = 1000;

export interface ScreenBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface IncomeFloater {
  text: string;
  /** Money spent or lost, drawn in red. */
  negative: boolean;
  x: number;
  y: number;
}

export interface FloaterSpace {
  /** The unit's rectangle in canvas device pixels, or null when it is off screen. */
  unitRect(unitId: string): ScreenBox | null;
  cssPerDevicePixel: number;
  canvasOrigin: { x: number; y: number };
}

/** One floater per money change tied to a unit that is on screen, placed over the unit's top centre. */
export function incomeFloaters(
  events: readonly ClientEvent[],
  space: FloaterSpace,
): IncomeFloater[] {
  const floaters: IncomeFloater[] = [];
  for (const event of events) {
    if (event.type !== 'moneyChanged' || event.amount === 0 || event.unitId === null) {
      continue;
    }
    const rect = space.unitRect(event.unitId);
    if (rect === null) {
      continue;
    }
    floaters.push({
      text: event.amount > 0 ? `+${formatMoney(event.amount)}` : `-${formatMoney(-event.amount)}`,
      negative: event.amount < 0,
      x: space.canvasOrigin.x + (rect.x + rect.width / 2) * space.cssPerDevicePixel,
      y: space.canvasOrigin.y + rect.y * space.cssPerDevicePixel,
    });
  }
  return floaters;
}
