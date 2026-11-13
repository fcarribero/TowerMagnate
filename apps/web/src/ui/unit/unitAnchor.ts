import type { Point, Size } from '../kit/windowStack';

export interface ClientRect extends Point, Size {}

/** Gap in CSS pixels between the unit and the panel. */
export const ANCHOR_GAP = 8;

/**
 * Where the fixed unit panel goes: at the top right corner of the unit, or at its
 * top left when there is no room on the right, and always whole inside the view.
 */
export function anchoredPosition(
  unit: ClientRect,
  panel: Size,
  view: Size,
  gap: number = ANCHOR_GAP,
): Point {
  const rightX = unit.x + unit.width + gap;
  const fitsRight = rightX + panel.width <= view.width;
  const wantedX = fitsRight ? rightX : unit.x - gap - panel.width;
  return {
    x: Math.round(clamp(wantedX, 0, view.width - panel.width)),
    y: Math.round(clamp(unit.y, 0, view.height - panel.height)),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
