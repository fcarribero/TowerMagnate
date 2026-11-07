import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { t } from '../strings';
import { useWindowManager } from './WindowLayer';
import { focusableElements, trapTabKey } from './focus';
import {
  centeredPosition,
  clampPosition,
  findWindow,
  frontWindow,
  type Point,
  type Size,
} from './windowStack';

const BASE_Z_INDEX = 10;

interface Drag {
  pointerId: number;
  startX: number;
  startY: number;
  startPosition: Point;
}

export interface WindowProps {
  id: string;
  title: string;
  children?: ComponentChildren;
  /** Called by the close button and by Esc. Defaults to closing the window. */
  onClose?: () => void;
  /** Decision dialogs have no close button and ignore Esc. */
  closable?: boolean;
  /** Width in UI pixels. */
  width?: number;
  /** Blocks the rest of the UI, keeps Tab inside and gives focus back when it closes. */
  modal?: boolean;
}

export function Window({
  id,
  title,
  children,
  onClose,
  closable = true,
  width,
  modal = false,
}: WindowProps) {
  const manager = useWindowManager();
  const frameRef = useRef<HTMLElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const openWindow = findWindow(manager.stack, id);
  const position = openWindow?.position;
  const close = onClose ?? (() => manager.close(id));
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    manager.setEscapeHandler(id, closable ? () => closeRef.current() : null);
    return () => manager.setEscapeHandler(id, null);
  }, [id, closable]);

  const isMounted = openWindow !== undefined;
  useEffect(() => {
    if (!isMounted) {
      return;
    }
    const focusedBefore = document.activeElement;
    return () => {
      if (modal && focusedBefore instanceof HTMLElement && focusedBefore.isConnected) {
        focusedBefore.focus({ preventScroll: true });
      }
    };
  }, [isMounted]);

  const pendingCenter = openWindow?.pendingCenter ?? false;
  // A window waiting to be centered is hidden, and hidden elements cannot take focus.
  const isPlaced = isMounted && !pendingCenter;
  useEffect(() => {
    if (isPlaced) {
      focusInitialElement(frameRef.current);
    }
  }, [isPlaced]);

  const isFront = frontWindow(manager.stack)?.id === id;
  const isFrontRef = useRef(isFront);
  isFrontRef.current = isFront;
  useEffect(() => {
    if (!modal || !isPlaced) {
      return;
    }
    return keepFocusInside(frameRef, isFrontRef);
  }, [modal, isPlaced]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!pendingCenter || frame === null || manager.viewSize.width === 0) {
      return;
    }
    manager.move(id, centeredPosition(frameSize(frame), manager.viewSize));
  }, [pendingCenter, manager.viewSize.width, manager.viewSize.height]);

  useEffect(() => {
    const frame = frameRef.current;
    if (position === undefined || frame === null || manager.viewSize.width === 0) {
      return;
    }
    const clamped = clampPosition(position, frameSize(frame), manager.viewSize, manager.uiScale);
    if (clamped.x !== position.x || clamped.y !== position.y) {
      manager.move(id, clamped);
    }
  }, [manager.viewSize.width, manager.viewSize.height, position?.x, position?.y]);

  if (openWindow === undefined || position === undefined) {
    return null;
  }

  const zIndex = BASE_Z_INDEX + 2 * manager.stack.windows.indexOf(openWindow) + 1;
  const titleId = `tm-window-title-${id}`;

  const onTitlePointerDown = (event: PointerEvent): void => {
    const target = event.target as Element;
    if (event.button !== 0 || target.closest('button') !== null) {
      return;
    }
    const titleBar = event.currentTarget as HTMLElement;
    titleBar.setPointerCapture?.(event.pointerId);
    const startPosition = position;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPosition,
    };
    manager.setDragCancel(() => {
      dragRef.current = null;
      manager.move(id, startPosition);
    });
    event.preventDefault();
    frameRef.current?.focus({ preventScroll: true });
  };

  const onTitlePointerMove = (event: PointerEvent): void => {
    const drag = dragRef.current;
    const frame = frameRef.current;
    if (drag === null || frame === null || drag.pointerId !== event.pointerId) {
      return;
    }
    const wanted = {
      x: drag.startPosition.x + event.clientX - drag.startX,
      y: drag.startPosition.y + event.clientY - drag.startY,
    };
    manager.move(id, clampPosition(wanted, frameSize(frame), manager.viewSize, manager.uiScale));
  };

  const onTitlePointerEnd = (event: PointerEvent): void => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      manager.setDragCancel(null);
    }
  };

  const classes = ['tm-window', isFront && 'is-active', pendingCenter && 'is-placing']
    .filter(Boolean)
    .join(' ');
  const widthStyle = width === undefined ? undefined : `calc(${width} * var(--tm-px))`;

  return (
    <>
      {modal && (
        <div
          class="tm-modal-backdrop"
          style={{ zIndex: zIndex - 1 }}
          onMouseDown={(event) => event.preventDefault()}
        />
      )}
      <section
        ref={frameRef}
        class={classes}
        role={modal ? 'alertdialog' : 'dialog'}
        aria-modal={modal ? true : undefined}
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{ left: `${position.x}px`, top: `${position.y}px`, zIndex, width: widthStyle }}
        onPointerDown={() => manager.focus(id)}
        onFocusCapture={() => manager.focus(id)}
      >
        <header
          class="tm-window__title"
          onPointerDown={onTitlePointerDown}
          onPointerMove={onTitlePointerMove}
          onPointerUp={onTitlePointerEnd}
          onPointerCancel={onTitlePointerEnd}
        >
          <span id={titleId} class="tm-window__title-text">
            {title}
          </span>
          {closable && (
            <button
              type="button"
              class="tm-window__close"
              aria-label={t('ui.close')}
              title={t('ui.close')}
              onClick={close}
            >
              x
            </button>
          )}
        </header>
        <div class="tm-window__body">{children}</div>
      </section>
    </>
  );
}

/**
 * While the modal is the front window, Tab cycles inside it and focus that lands
 * anywhere else, for example on the page after a backdrop click, comes back to it.
 */
function keepFocusInside(
  frameRef: { current: HTMLElement | null },
  isFrontRef: { current: boolean },
): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    const frame = frameRef.current;
    if (frame !== null && isFrontRef.current) {
      trapTabKey(event, frame);
    }
  };
  const onFocusIn = (event: FocusEvent): void => {
    const frame = frameRef.current;
    const target = event.target;
    if (frame === null || !isFrontRef.current || !(target instanceof Node)) {
      return;
    }
    if (!frame.contains(target)) {
      frame.focus({ preventScroll: true });
    }
  };
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('focusin', onFocusIn);
  return () => {
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('focusin', onFocusIn);
  };
}

/** Focuses the element marked to start with focus, else the frame itself. */
function focusInitialElement(frame: HTMLElement | null): void {
  if (frame === null) {
    return;
  }
  const marked = focusableElements(frame).find((element) => element.hasAttribute('data-autofocus'));
  (marked ?? frame).focus({ preventScroll: true });
}

function frameSize(frame: HTMLElement): Size {
  return { width: frame.offsetWidth, height: frame.offsetHeight };
}
