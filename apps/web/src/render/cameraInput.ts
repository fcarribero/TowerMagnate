import { isShortcutBlocked } from '../input/keyboard';
import { nextZoom, panCamera, zoomCamera, type Camera } from './camera';

export type CameraChange = (camera: Camera) => Camera;

interface Drag {
  pointerId: number;
  startX: number;
  startY: number;
  startCamera: Camera;
}

const WHEEL_LINE_PIXELS = 16;
const WHEEL_ZOOM_THRESHOLD = 100;

/**
 * Drag to scroll, wheel to scroll, Ctrl + wheel or +/- to zoom. Returns a
 * function that removes the listeners.
 */
export function attachCameraInput(
  canvas: HTMLCanvasElement,
  getCamera: () => Camera,
  update: (change: CameraChange) => void,
): () => void {
  let drag: Drag | null = null;
  let pendingZoomDelta = 0;

  const toDevicePixels = (cssPixels: number): number => cssPixels * window.devicePixelRatio;

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 && event.button !== 1) {
      return;
    }
    canvas.setPointerCapture(event.pointerId);
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startCamera: getCamera(),
    };
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (drag === null || drag.pointerId !== event.pointerId) {
      return;
    }
    const { startCamera, startX, startY } = drag;
    const dx = toDevicePixels(event.clientX - startX);
    const dy = toDevicePixels(event.clientY - startY);
    update(() => panCamera(startCamera, dx, dy));
  };

  const onPointerEnd = (event: PointerEvent): void => {
    if (drag?.pointerId === event.pointerId) {
      drag = null;
    }
  };

  const onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? WHEEL_LINE_PIXELS : 1;
    if (event.ctrlKey || event.metaKey) {
      pendingZoomDelta += event.deltaY * scale;
      if (Math.abs(pendingZoomDelta) < WHEEL_ZOOM_THRESHOLD) {
        return;
      }
      const direction = pendingZoomDelta < 0 ? 1 : -1;
      pendingZoomDelta = 0;
      const anchorX = toDevicePixels(event.offsetX);
      const anchorY = toDevicePixels(event.offsetY);
      update((camera) => zoomCamera(camera, nextZoom(camera.zoom, direction), anchorX, anchorY));
      return;
    }
    const dx = toDevicePixels(-event.deltaX * scale);
    const dy = toDevicePixels(-event.deltaY * scale);
    update((camera) => panCamera(camera, dx, dy));
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (isShortcutBlocked(event)) {
      return;
    }
    const direction = zoomKeyDirection(event.key);
    if (direction === null) {
      return;
    }
    update((camera) =>
      zoomCamera(
        camera,
        nextZoom(camera.zoom, direction),
        camera.viewWidth / 2,
        camera.viewHeight / 2,
      ),
    );
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerEnd);
  canvas.addEventListener('pointercancel', onPointerEnd);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKeyDown);

  return () => {
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerEnd);
    canvas.removeEventListener('pointercancel', onPointerEnd);
    canvas.removeEventListener('wheel', onWheel);
    window.removeEventListener('keydown', onKeyDown);
  };
}

export function zoomKeyDirection(key: string): 1 | -1 | null {
  if (key === '+' || key === '=') {
    return 1;
  }
  if (key === '-' || key === '_') {
    return -1;
  }
  return null;
}
