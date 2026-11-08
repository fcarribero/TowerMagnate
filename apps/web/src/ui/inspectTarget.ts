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

export const MAX_INSPECT_TARGETS = 5;

export function inspectTargetKey(target: InspectTarget): string {
  return target.kind === 'finances' ? target.kind : `${target.kind}:${target.id}`;
}

function targetOfWindow(window: { id: string; kind: string }): InspectTarget | null {
  if (window.kind === UNIT_WINDOW_KIND) {
    return { kind: 'unit', id: entityOfWindow(window.id) };
  }
  if (window.kind === ELEVATOR_WINDOW_KIND) {
    return { kind: 'shaft', id: entityOfWindow(window.id) };
  }
  return null;
}

/** Every unit and elevator window is inspected. Past the server limit, the windows in front win. */
export function openInspectTargets(
  windows: readonly { id: string; kind: string }[],
): InspectTarget[] {
  const targets = windows.flatMap((window) => targetOfWindow(window) ?? []);
  return targets.slice(-MAX_INSPECT_TARGETS);
}

export function diffInspectTargets(
  previous: readonly InspectTarget[],
  next: readonly InspectTarget[],
): { added: InspectTarget[]; removed: InspectTarget[] } {
  const previousKeys = new Set(previous.map(inspectTargetKey));
  const nextKeys = new Set(next.map(inspectTargetKey));
  return {
    added: next.filter((target) => !previousKeys.has(inspectTargetKey(target))),
    removed: previous.filter((target) => !nextKeys.has(inspectTargetKey(target))),
  };
}
