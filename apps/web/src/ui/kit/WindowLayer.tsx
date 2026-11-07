import { createContext, type ComponentChildren } from 'preact';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { isShortcutBlocked } from '../../input/keyboard';
import {
  EMPTY_STACK,
  closeWindow,
  focusWindow,
  frontWindow,
  moveWindow,
  openWindow,
  type OpenRequest,
  type Point,
  type Size,
  type WindowStack,
} from './windowStack';

type EscapeHandler = () => void;

export interface WindowManager {
  stack: WindowStack;
  viewSize: Size;
  uiScale: number;
  /** Positions in a request are in UI pixels; the window manager scales them. */
  open(request: OpenRequest): void;
  close(id: string): void;
  focus(id: string): void;
  move(id: string, position: Point): void;
  isOpen(id: string): boolean;
  /** What Esc does while this window is in front; null means Esc leaves it open. */
  setEscapeHandler(id: string, handler: EscapeHandler | null): void;
  /** While a drag runs, Esc cancels it instead of closing a window. */
  setDragCancel(cancel: (() => void) | null): void;
}

const WindowManagerContext = createContext<WindowManager | null>(null);

export function useWindowManager(): WindowManager {
  const manager = useContext(WindowManagerContext);
  if (manager === null) {
    throw new Error('useWindowManager must be used inside a WindowLayer');
  }
  return manager;
}

function scaleRequest(request: OpenRequest, uiScale: number): OpenRequest {
  if (request.position === undefined) {
    return request;
  }
  const { x, y } = request.position;
  return { ...request, position: { x: x * uiScale, y: y * uiScale } };
}

function measure(element: HTMLElement | null): Size {
  return { width: element?.clientWidth ?? 0, height: element?.clientHeight ?? 0 };
}

interface WindowLayerProps {
  children?: ComponentChildren;
  class?: string;
  uiScale?: number;
}

/** The area windows float over. Windows inside it are kept within its bounds. */
export function WindowLayer({ children, class: className, uiScale = 1 }: WindowLayerProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const [stack, setStack] = useState<WindowStack>(EMPTY_STACK);
  const [viewSize, setViewSize] = useState<Size>({ width: 0, height: 0 });
  const stackRef = useRef(stack);
  stackRef.current = stack;
  const escapeHandlers = useRef(new Map<string, EscapeHandler>());
  const dragCancel = useRef<(() => void) | null>(null);

  useEffect(() => {
    const update = () => setViewSize(measure(layerRef.current));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || isShortcutBlocked(event)) {
        return;
      }
      if (dragCancel.current !== null) {
        dragCancel.current();
        dragCancel.current = null;
        event.preventDefault();
        return;
      }
      const front = frontWindow(stackRef.current);
      const handler = front === undefined ? undefined : escapeHandlers.current.get(front.id);
      if (handler !== undefined) {
        handler();
        event.preventDefault();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const setEscapeHandler = useCallback((id: string, handler: EscapeHandler | null) => {
    if (handler === null) {
      escapeHandlers.current.delete(id);
    } else {
      escapeHandlers.current.set(id, handler);
    }
  }, []);

  const setDragCancel = useCallback((cancel: (() => void) | null) => {
    dragCancel.current = cancel;
  }, []);

  const manager = useMemo<WindowManager>(
    () => ({
      stack,
      viewSize,
      uiScale,
      open: (request) => setStack((current) => openWindow(current, scaleRequest(request, uiScale))),
      close: (id) => setStack((current) => closeWindow(current, id)),
      focus: (id) => setStack((current) => focusWindow(current, id)),
      move: (id, position) => setStack((current) => moveWindow(current, id, position)),
      isOpen: (id) => stack.windows.some((window) => window.id === id),
      setEscapeHandler,
      setDragCancel,
    }),
    [stack, viewSize, uiScale, setEscapeHandler, setDragCancel],
  );

  return (
    <WindowManagerContext.Provider value={manager}>
      <div ref={layerRef} class={['tm-window-layer', className].filter(Boolean).join(' ')}>
        {children}
      </div>
    </WindowManagerContext.Provider>
  );
}
