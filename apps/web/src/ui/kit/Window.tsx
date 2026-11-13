import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { t } from '../strings';
import { useWindowManager } from './WindowLayer';
import { focusableElements, trapTabKey } from './focus';
import {
  CORNER_INSET,
  belowCovering,
  centeredPosition,
  clampPosition,
  cornerPosition,
  findWindow,
  frontWindow,
  type Placement,
  type Rect,
  type Point,
  type Size,
  type WindowStack,
} from './windowStack';

const BASE_Z_INDEX = 10;
/** A window body stops this far short of the tower view height and scrolls. */
const BODY_MARGIN_UI_PIXELS = 24;

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
  /** False keeps Esc but hides the close button, as confirm dialogs do. */
  showCloseButton?: boolean;
  /** Width in UI pixels. */
  width?: number;
  /** Blocks the rest of the UI, keeps Tab inside and gives focus back when it closes. */
  modal?: boolean;
  /** Title bar color; green is for Finanzas. */
  tone?: 'blue' | 'green';
  /** Dialogs get the thick border, the hazard stripe and a paper title. */
  isDialog?: boolean;
  /** Dialog title color: red asks for a decision, ink only informs. */
  dialogTone?: 'alert' | 'info';
  /** Small line above the title, for example the type and level of a unit. */
  subtitle?: string;
  /** False pins the window where its owner puts it: the title bar no longer drags. */
  draggable?: boolean;
}

export function Window({
  id,
  title,
  children,
  onClose,
  closable = true,
  showCloseButton = true,
  width,
  modal = false,
  tone = 'blue',
  isDialog = false,
  dialogTone = 'alert',
  subtitle,
  draggable = true,
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

  const pendingPlacement = openWindow?.pendingPlacement ?? null;
  const isWaitingForPlace = pendingPlacement !== null;
  // A window waiting to be placed is hidden, and hidden elements cannot take focus.
  const isPlaced = isMounted && !isWaitingForPlace;
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
    if (pendingPlacement === null || frame === null || manager.viewSize.width === 0) {
      return;
    }
    manager.move(id, placedPosition(pendingPlacement, frame, manager));
  }, [isWaitingForPlace, manager.viewSize.width, manager.viewSize.height]);

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

  const bodyStyle =
    manager.viewSize.height > 0
      ? {
          maxHeight: `calc(${manager.viewSize.height}px - ${BODY_MARGIN_UI_PIXELS} * var(--tm-px))`,
        }
      : undefined;
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

  const classes = [
    'tm-window',
    tone === 'green' && 'tm-window--green',
    isDialog && 'tm-window--dialog',
    isDialog && dialogTone === 'info' && 'tm-window--dialog-info',
    subtitle !== undefined && 'tm-window--subtitled',
    isFront && 'is-active',
    isWaitingForPlace && 'is-placing',
  ]
    .filter(Boolean)
    .join(' ');
  const dragHandlers = draggable
    ? {
        onPointerDown: onTitlePointerDown,
        onPointerMove: onTitlePointerMove,
        onPointerUp: onTitlePointerEnd,
        onPointerCancel: onTitlePointerEnd,
      }
    : {};
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
        data-window-id={id}
        onPointerDown={() => manager.focus(id)}
        onFocusCapture={() => manager.focus(id)}
      >
        {isDialog && <div class="tm-window__stripe" {...dragHandlers} />}
        <header class="tm-window__title" {...dragHandlers}>
          <span class="tm-window__heading">
            {subtitle !== undefined && <span class="tm-window__subtitle">{subtitle}</span>}
            <span id={titleId} class="tm-window__title-text">
              {title}
            </span>
          </span>
          {closable && showCloseButton && (
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
        <div class="tm-window__body" style={bodyStyle}>
          {children}
        </div>
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

function placedPosition(
  placement: Placement,
  frame: HTMLElement,
  manager: { stack: WindowStack; viewSize: Size; uiScale: number },
): Point {
  const size = frameSize(frame);
  if (placement.kind === 'center') {
    return centeredPosition(size, manager.viewSize);
  }
  const inset = CORNER_INSET * manager.uiScale;
  const top = bottomOf(placement.belowId, frame, manager.stack);
  const corner = cornerPosition(
    placement.corner,
    size,
    manager.viewSize,
    inset,
    top === null ? inset : top + inset,
  );
  return belowCovering({ ...corner, ...size }, placedRects(frame, manager.stack), inset);
}

/** Frames of the other windows that are already in place. */
function placedRects(frame: HTMLElement, stack: WindowStack): Rect[] {
  return stack.windows
    .filter((open) => open.pendingPlacement === null)
    .flatMap((open) => {
      const element = frame.parentElement?.querySelector<HTMLElement>(
        `[data-window-id="${open.id}"]`,
      );
      if (!element || element === frame) {
        return [];
      }
      return [{ ...open.position, ...frameSize(element) }];
    });
}

/** Bottom edge of an open window inside the same layer, or null when it is not open. */
function bottomOf(id: string | undefined, frame: HTMLElement, stack: WindowStack): number | null {
  const open = id === undefined ? undefined : findWindow(stack, id);
  const element = frame.parentElement?.querySelector<HTMLElement>(`[data-window-id="${id}"]`);
  if (open === undefined || !element) {
    return null;
  }
  return open.position.y + element.offsetHeight;
}

function frameSize(frame: HTMLElement): Size {
  return { width: frame.offsetWidth, height: frame.offsetHeight };
}
