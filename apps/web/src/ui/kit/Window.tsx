import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { t } from '../strings';
import { useWindowManager } from './WindowLayer';
import { clampPosition, findWindow, frontWindow, type Point, type Size } from './windowStack';

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
  width?: number;
}

export function Window({ id, title, children, onClose, closable = true, width }: WindowProps) {
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
    if (isMounted) {
      frameRef.current?.focus({ preventScroll: true });
    }
  }, [isMounted]);

  useEffect(() => {
    const frame = frameRef.current;
    if (position === undefined || frame === null || manager.viewSize.width === 0) {
      return;
    }
    const clamped = clampPosition(position, frameSize(frame), manager.viewSize);
    if (clamped.x !== position.x || clamped.y !== position.y) {
      manager.move(id, clamped);
    }
  }, [manager.viewSize.width, manager.viewSize.height, position?.x, position?.y]);

  if (openWindow === undefined || position === undefined) {
    return null;
  }

  const isFront = frontWindow(manager.stack)?.id === id;
  const zIndex = BASE_Z_INDEX + manager.stack.windows.indexOf(openWindow);
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
    manager.move(id, clampPosition(wanted, frameSize(frame), manager.viewSize));
  };

  const onTitlePointerEnd = (event: PointerEvent): void => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      manager.setDragCancel(null);
    }
  };

  return (
    <section
      ref={frameRef}
      class={isFront ? 'tm-window is-active' : 'tm-window'}
      role="dialog"
      aria-labelledby={titleId}
      tabIndex={-1}
      style={{ left: `${position.x}px`, top: `${position.y}px`, zIndex, width }}
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
  );
}

function frameSize(frame: HTMLElement): Size {
  return { width: frame.offsetWidth, height: frame.offsetHeight };
}
