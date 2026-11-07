import type { VNode } from 'preact';
import { useEffect, useId, useRef, useState } from 'preact/hooks';

export const TOOLTIP_DELAY_MS = 500;
const GAP_UI_PIXELS = 4;

export interface TooltipProps {
  /** One string per line. */
  text: string | readonly string[];
  /** A single element; its root gets `aria-describedby` pointing at the tooltip. */
  children: VNode;
  delayMs?: number;
}

interface Placement {
  left: number;
  top: number;
}

/**
 * Shows a short text under its element after the pointer rests on it, or at
 * once when the element gets keyboard focus.
 */
export function Tooltip({ text, children, delayMs = TOOLTIP_DELAY_MS }: TooltipProps) {
  const tooltipId = useId();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const [visible, setVisible] = useState(false);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const lines = typeof text === 'string' ? [text] : text;

  const cancelTimer = (): void => {
    window.clearTimeout(timerRef.current);
    timerRef.current = undefined;
  };
  const show = (): void => {
    cancelTimer();
    setVisible(true);
  };
  const showLater = (): void => {
    cancelTimer();
    timerRef.current = window.setTimeout(show, delayMs);
  };
  const hide = (): void => {
    cancelTimer();
    setVisible(false);
    setPlacement(null);
  };

  useEffect(() => cancelTimer, []);

  useEffect(() => {
    anchorRef.current?.firstElementChild?.setAttribute('aria-describedby', tooltipId);
  }, [tooltipId]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        hide();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visible]);

  useEffect(() => {
    const anchor = anchorRef.current;
    const tip = tipRef.current;
    if (!visible || anchor === null || tip === null) {
      return;
    }
    setPlacement(placeBelow(anchor.getBoundingClientRect(), tip, uiScaleOf(anchor)));
  }, [visible, lines.join('\n')]);

  return (
    <span
      ref={anchorRef}
      class="tm-tooltip-anchor"
      onPointerEnter={showLater}
      onPointerLeave={hide}
      onPointerDown={hide}
      onFocusIn={(event) => {
        if ((event.target as Element).matches(':focus-visible')) {
          show();
        }
      }}
      onFocusOut={hide}
    >
      {children}
      <span
        ref={tipRef}
        id={tooltipId}
        role="tooltip"
        class="tm-tooltip"
        hidden={!visible}
        style={{
          left: `${placement?.left ?? 0}px`,
          top: `${placement?.top ?? 0}px`,
          visibility: placement === null ? 'hidden' : undefined,
        }}
      >
        {lines.map((line) => (
          <span key={line} class="tm-tooltip__line">
            {line}
          </span>
        ))}
      </span>
    </span>
  );
}

function uiScaleOf(element: Element): number {
  const value = Number(getComputedStyle(element).getPropertyValue('--tm-ui-scale'));
  return Number.isFinite(value) && value > 0 ? value : 1;
}

/** Under the anchor, left aligned, and pushed back inside the viewport. */
export function placeBelow(anchor: DOMRect, tip: HTMLElement, uiScale: number): Placement {
  const gap = GAP_UI_PIXELS * uiScale;
  const width = tip.offsetWidth;
  const height = tip.offsetHeight;
  const maxLeft = window.innerWidth - width;
  const fitsBelow = anchor.bottom + gap + height <= window.innerHeight;
  return {
    left: Math.round(Math.max(Math.min(anchor.left, maxLeft), 0)),
    top: Math.round(fitsBelow ? anchor.bottom + gap : Math.max(anchor.top - gap - height, 0)),
  };
}
