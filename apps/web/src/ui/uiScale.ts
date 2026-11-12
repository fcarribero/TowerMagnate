import { useEffect, useState } from 'preact/hooks';

export const MIN_VIEWPORT_WIDTH = 1024;
export const MIN_VIEWPORT_HEIGHT = 640;
export const MIN_UI_SCALE = 1;
export const MAX_UI_SCALE = 4.5;
/** The scale at the design size: 1 UI pixel is 1.5 CSS pixels at 1280 x 800. */
export const DESIGN_UI_SCALE = 1.5;
export const DESIGN_VIEWPORT_WIDTH = 1280;
export const DESIGN_VIEWPORT_HEIGHT = 800;
const SCALE_STEP = 0.25;

/**
 * How many CSS pixels one UI pixel takes. It grows with the viewport in quarter steps, from the
 * design size of 1280 x 800, where it is 1.5. The fonts are outline fonts, so it need not be whole.
 */
export function uiScaleFor(viewportWidth: number, viewportHeight: number): number {
  const fit = Math.min(
    viewportWidth / DESIGN_VIEWPORT_WIDTH,
    viewportHeight / DESIGN_VIEWPORT_HEIGHT,
  );
  const stepped = Math.round((fit * DESIGN_UI_SCALE) / SCALE_STEP) * SCALE_STEP;
  return Math.min(Math.max(stepped, MIN_UI_SCALE), MAX_UI_SCALE);
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
