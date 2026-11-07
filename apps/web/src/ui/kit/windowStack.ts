export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface OpenWindow {
  id: string;
  kind: string;
  position: Point;
  openedAt: number;
}

/** Windows in back-to-front order: the last one is the front window. */
export interface WindowStack {
  windows: readonly OpenWindow[];
  lastPositions: Readonly<Record<string, Point>>;
  openCount: number;
}

export interface OpenRequest {
  id: string;
  /** Windows of the same kind share a limit; defaults to the id. */
  kind?: string;
  position: Point;
}

export const EMPTY_STACK: WindowStack = { windows: [], lastPositions: {}, openCount: 0 };

const KIND_LIMITS: Readonly<Record<string, number>> = { unit: 4, person: 4, elevator: 2 };

/** Part of the title bar that must stay inside the tower view (UI-04). */
export const TITLE_BAR_KEEP_WIDTH = 24;
export const TITLE_BAR_KEEP_HEIGHT = 12;

export function windowLimit(kind: string): number {
  return KIND_LIMITS[kind] ?? 1;
}

export function clampPosition(position: Point, windowSize: Size, view: Size): Point {
  const minX = TITLE_BAR_KEEP_WIDTH - windowSize.width;
  const maxX = view.width - TITLE_BAR_KEEP_WIDTH;
  const maxY = view.height - TITLE_BAR_KEEP_HEIGHT;
  return {
    x: Math.round(clamp(position.x, minX, maxX)),
    y: Math.round(clamp(position.y, 0, maxY)),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function frontWindow(stack: WindowStack): OpenWindow | undefined {
  return stack.windows.at(-1);
}

export function findWindow(stack: WindowStack, id: string): OpenWindow | undefined {
  return stack.windows.find((window) => window.id === id);
}

/**
 * Opens a window at the front. A window already open is only brought to the
 * front. Past the limit of its kind, the oldest window of that kind closes. A
 * window opened again comes back where it was last left.
 */
export function openWindow(stack: WindowStack, request: OpenRequest): WindowStack {
  if (findWindow(stack, request.id) !== undefined) {
    return focusWindow(stack, request.id);
  }
  const opened: OpenWindow = {
    id: request.id,
    kind: request.kind ?? request.id,
    position: stack.lastPositions[request.id] ?? request.position,
    openedAt: stack.openCount,
  };
  const windows = [...stack.windows, opened];
  const sameKind = windows
    .filter((window) => window.kind === opened.kind)
    .sort((a, b) => a.openedAt - b.openedAt);
  const excess = sameKind.length - windowLimit(opened.kind);
  const closing = new Set(sameKind.slice(0, Math.max(excess, 0)).map((window) => window.id));
  return {
    ...stack,
    windows: windows.filter((window) => !closing.has(window.id)),
    openCount: stack.openCount + 1,
  };
}

export function focusWindow(stack: WindowStack, id: string): WindowStack {
  const target = findWindow(stack, id);
  if (target === undefined || frontWindow(stack) === target) {
    return stack;
  }
  return { ...stack, windows: [...stack.windows.filter((window) => window !== target), target] };
}

export function moveWindow(stack: WindowStack, id: string, position: Point): WindowStack {
  if (findWindow(stack, id) === undefined) {
    return stack;
  }
  return {
    ...stack,
    windows: stack.windows.map((window) => (window.id === id ? { ...window, position } : window)),
  };
}

export function closeWindow(stack: WindowStack, id: string): WindowStack {
  const target = findWindow(stack, id);
  if (target === undefined) {
    return stack;
  }
  return {
    ...stack,
    windows: stack.windows.filter((window) => window !== target),
    lastPositions: { ...stack.lastPositions, [id]: target.position },
  };
}
