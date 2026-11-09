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
  /** Dialogs stay above every ordinary window. */
  onTop: boolean;
  /** Waiting to be placed once its size is known. */
  pendingPlacement: Placement | null;
}

export type Corner = 'topLeft' | 'topRight';

export type Placement = { kind: 'center' } | { kind: 'corner'; corner: Corner; belowId?: string };

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
  /** Where the window opens; without one it opens centered or in `corner`. */
  position?: Point;
  /** Opens in a corner of the view, below the window `belowId` when that one is open. */
  corner?: Corner;
  belowId?: string;
  onTop?: boolean;
}

export const EMPTY_STACK: WindowStack = { windows: [], lastPositions: {}, openCount: 0 };

const KIND_LIMITS: Readonly<Record<string, number>> = { unit: 4, person: 4, elevator: 2 };

/** Part of the title bar that must stay inside the tower view (UI-04). */
export const TITLE_BAR_KEEP_WIDTH = 24;
export const TITLE_BAR_KEEP_HEIGHT = 12;

export function windowLimit(kind: string): number {
  return KIND_LIMITS[kind] ?? 1;
}

export function clampPosition(position: Point, windowSize: Size, view: Size, uiScale = 1): Point {
  const keepWidth = TITLE_BAR_KEEP_WIDTH * uiScale;
  const minX = keepWidth - windowSize.width;
  const maxX = view.width - keepWidth;
  const maxY = view.height - TITLE_BAR_KEEP_HEIGHT * uiScale;
  return {
    x: Math.round(clamp(position.x, minX, maxX)),
    y: Math.round(clamp(position.y, 0, maxY)),
  };
}

function placementOf(request: OpenRequest): Placement {
  if (request.corner === undefined) {
    return { kind: 'center' };
  }
  return { kind: 'corner', corner: request.corner, belowId: request.belowId };
}

/** Distance in UI pixels from the view edge to a window placed in a corner. */
export const CORNER_INSET = 8;

export function cornerPosition(
  corner: Corner,
  windowSize: Size,
  view: Size,
  inset: number,
  top = inset,
): Point {
  const x = corner === 'topLeft' ? inset : view.width - windowSize.width - inset;
  return { x: Math.max(x, 0), y: top };
}

export function centeredPosition(windowSize: Size, view: Size): Point {
  return {
    x: Math.max(Math.floor((view.width - windowSize.width) / 2), 0),
    y: Math.max(Math.floor((view.height - windowSize.height) / 2), 0),
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
  const remembered = request.onTop ? undefined : stack.lastPositions[request.id];
  const requested = remembered ?? request.position;
  const needsPlacement = requested === undefined;
  const opened: OpenWindow = {
    id: request.id,
    kind: request.kind ?? request.id,
    position: requested ?? { x: 0, y: 0 },
    openedAt: stack.openCount,
    onTop: request.onTop ?? false,
    pendingPlacement: needsPlacement ? placementOf(request) : null,
  };
  const windows = keepDialogsOnTop([...stack.windows, opened]);
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
  const reordered = [...stack.windows.filter((window) => window !== target), target];
  return { ...stack, windows: keepDialogsOnTop(reordered) };
}

export function moveWindow(stack: WindowStack, id: string, position: Point): WindowStack {
  if (findWindow(stack, id) === undefined) {
    return stack;
  }
  return {
    ...stack,
    windows: stack.windows.map((window) =>
      window.id === id ? { ...window, position, pendingPlacement: null } : window,
    ),
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
    lastPositions: rememberPosition(stack.lastPositions, target),
  };
}

function rememberPosition(
  lastPositions: WindowStack['lastPositions'],
  closing: OpenWindow,
): WindowStack['lastPositions'] {
  if (closing.onTop) {
    return lastPositions;
  }
  return { ...lastPositions, [closing.id]: closing.position };
}

/** Moves on-top windows after the others and keeps the order inside each group. */
function keepDialogsOnTop(windows: readonly OpenWindow[]): OpenWindow[] {
  return [
    ...windows.filter((window) => !window.onTop),
    ...windows.filter((window) => window.onTop),
  ];
}

export interface Rect extends Point, Size {}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** Moves a window down until it no longer covers any of the other windows. */
export function belowCovering(candidate: Rect, others: readonly Rect[], gap: number): Point {
  let y = candidate.y;
  const byTop = [...others].sort((a, b) => a.y - b.y);
  for (const other of byTop) {
    if (overlaps({ ...candidate, y }, other)) {
      y = other.y + other.height + gap;
    }
  }
  return { x: candidate.x, y };
}
