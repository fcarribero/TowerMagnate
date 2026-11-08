import type { InspectTarget } from '@tower-magnate/shared';

export const UNIT_WINDOW_KIND = 'unit';
export const ELEVATOR_WINDOW_KIND = 'elevator';

export function unitWindowId(unitId: string): string {
  return `${UNIT_WINDOW_KIND}:${unitId}`;
}

export function elevatorWindowId(shaftId: string): string {
  return `${ELEVATOR_WINDOW_KIND}:${shaftId}`;
}

export function entityOfWindow(windowId: string): string {
  return windowId.slice(windowId.indexOf(':') + 1);
}

/** What the server should inspect for the window in front, or null when it shows nothing inspectable. */
export function frontInspectTarget(
  front: { id: string; kind: string } | undefined,
): InspectTarget | null {
  if (front?.kind === UNIT_WINDOW_KIND) {
    return { kind: 'unit', id: entityOfWindow(front.id) };
  }
  if (front?.kind === ELEVATOR_WINDOW_KIND) {
    return { kind: 'shaft', id: entityOfWindow(front.id) };
  }
  return null;
}
