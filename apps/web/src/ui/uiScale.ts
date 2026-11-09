import { useEffect, useState } from 'preact/hooks';

export const MIN_VIEWPORT_WIDTH = 1024;
export const MIN_VIEWPORT_HEIGHT = 640;
export const MAX_UI_SCALE = 3;

/** How many CSS pixels one UI pixel takes: whole steps only, so the pixel font stays sharp. */
export function uiScaleFor(viewportWidth: number, viewportHeight: number): number {
  const fit = Math.floor(
    Math.min(viewportWidth / MIN_VIEWPORT_WIDTH, viewportHeight / MIN_VIEWPORT_HEIGHT),
  );
  return Math.min(Math.max(fit, 1), MAX_UI_SCALE);
}

export function isViewportTooSmall(viewportWidth: number, viewportHeight: number): boolean {
  return viewportWidth < MIN_VIEWPORT_WIDTH || viewportHeight < MIN_VIEWPORT_HEIGHT;
}

export interface UiScale {
  scale: number;
  tooSmall: boolean;
}

function readViewport(): UiScale {
  const { innerWidth, innerHeight } = window;
  return {
    scale: uiScaleFor(innerWidth, innerHeight),
    tooSmall: isViewportTooSmall(innerWidth, innerHeight),
  };
}

/**
 * Follows the browser viewport and publishes the scale as the `--tm-ui-scale`
 * CSS variable that every UI size is multiplied by. Use it once, at the root.
 */
export function useUiScale(): UiScale {
  const [current, setCurrent] = useState(readViewport);

  useEffect(() => {
    const update = () => setCurrent(readViewport());
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--tm-ui-scale', String(current.scale));
  }, [current.scale]);

  return current;
}

/** The current scale without publishing it; for code that needs it in pixels. */
export function useViewportUiScale(): number {
  const [scale, setScale] = useState(() => readViewport().scale);
  useEffect(() => {
    const update = () => setScale(readViewport().scale);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return scale;
}
