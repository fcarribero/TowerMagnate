import { Application, Container, TextureSource } from 'pixi.js';
import { canvasSizeFromCssPixels, canvasSizeFromObservedBox, type CanvasSize } from './canvasSize';
import { groundOrigin } from './layout';
import type { Zoom } from './metrics';
import { createPlaceholderScene } from './placeholderScene';

const SKY_COLOR = '#6f9fd8';
const DEFAULT_ZOOM: Zoom = 2;

export interface Stage {
  destroy(): void;
}

export async function mountStage(host: HTMLElement): Promise<Stage> {
  TextureSource.defaultOptions.scaleMode = 'nearest';

  const app = new Application();
  await app.init({
    background: SKY_COLOR,
    antialias: false,
    resolution: 1,
    autoDensity: false,
    roundPixels: true,
    width: 1,
    height: 1,
  });
  host.appendChild(app.canvas);

  const world = new Container();
  world.scale.set(DEFAULT_ZOOM);
  world.addChild(createPlaceholderScene());
  app.stage.addChild(world);

  const applySize = (size: CanvasSize): void => {
    app.renderer.resize(size.deviceWidth, size.deviceHeight);
    app.canvas.style.width = `${size.cssWidth}px`;
    app.canvas.style.height = `${size.cssHeight}px`;
    const origin = groundOrigin(size.deviceWidth, size.deviceHeight, DEFAULT_ZOOM);
    world.position.set(origin.x, origin.y);
  };

  applySize(measureHost(host));
  const observer = observeDeviceSize(host, applySize);

  return {
    destroy() {
      observer.disconnect();
      app.destroy({ removeView: true }, { children: true });
    },
  };
}

function measureHost(host: HTMLElement): CanvasSize {
  return canvasSizeFromCssPixels(host.clientWidth, host.clientHeight, window.devicePixelRatio);
}

function observeDeviceSize(
  host: HTMLElement,
  onResize: (size: CanvasSize) => void,
): ResizeObserver {
  const observer = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (entry === undefined) {
      return;
    }
    const cssBox = entry.contentBoxSize[0];
    if (cssBox === undefined) {
      onResize(measureHost(host));
      return;
    }
    const deviceBox = entry.devicePixelContentBoxSize?.[0];
    onResize(
      canvasSizeFromObservedBox(
        { width: cssBox.inlineSize, height: cssBox.blockSize },
        deviceBox && { width: deviceBox.inlineSize, height: deviceBox.blockSize },
        window.devicePixelRatio,
      ),
    );
  });

  try {
    observer.observe(host, { box: 'device-pixel-content-box' });
  } catch {
    observer.observe(host);
  }
  return observer;
}
