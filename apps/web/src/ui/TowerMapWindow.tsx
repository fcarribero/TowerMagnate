import { useEffect, useRef } from 'preact/hooks';
import type { TowerContentStore } from '../model/towerContent';
import type { Camera } from '../render/camera';
import type { Stage } from '../render/stage';
import {
  MAP_COLORS,
  MAP_HEIGHT,
  MAP_WIDTH,
  mapFrame,
  mapPointToWorld,
  paintTowerMap,
} from '../render/towerMap';
import { t } from './strings';
import { throttle } from './throttle';

const REDRAW_INTERVAL_MS = 1000;
const FRAME_COLOR = `#${MAP_COLORS.frame.toString(16).padStart(6, '0')}`;

interface TowerMapWindowProps {
  content: TowerContentStore;
  stage: Stage;
  onClose: () => void;
}

export function TowerMapWindow({ content, stage, onClose }: TowerMapWindowProps) {
  const pictureRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const context = pictureRef.current?.getContext('2d');
    if (!context) {
      return;
    }
    const redraw = throttle(() => {
      const pixels = paintTowerMap(content.content);
      context.putImageData(new ImageData(pixels, MAP_WIDTH, MAP_HEIGHT), 0, 0);
    }, REDRAW_INTERVAL_MS);
    redraw.request();
    const unsubscribe = content.subscribe(() => redraw.request());
    return () => {
      unsubscribe();
      redraw.cancel();
    };
  }, [content]);

  useEffect(() => {
    const context = frameRef.current?.getContext('2d');
    if (!context) {
      return;
    }
    const drawFrame = (camera: Camera): void => {
      const frame = mapFrame(camera);
      context.clearRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
      context.strokeStyle = FRAME_COLOR;
      context.lineWidth = 1;
      context.strokeRect(frame.x + 0.5, frame.y + 0.5, frame.width - 1, frame.height - 1);
    };
    drawFrame(stage.camera());
    return stage.onCameraChange(drawFrame);
  }, [stage]);

  const centerOnPointer = (event: PointerEvent): void => {
    const target = event.currentTarget as HTMLElement;
    const box = target.getBoundingClientRect();
    const mapX = ((event.clientX - box.left) * MAP_WIDTH) / box.width;
    const mapY = ((event.clientY - box.top) * MAP_HEIGHT) / box.height;
    const { worldX, worldY } = mapPointToWorld(mapX, mapY);
    stage.centerOn(worldX, worldY);
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) {
      return;
    }
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    centerOnPointer(event);
  };

  const onPointerMove = (event: PointerEvent): void => {
    if ((event.buttons & 1) === 1) {
      centerOnPointer(event);
    }
  };

  return (
    <section class="window tower-map-window" aria-label={t('window.map.title')}>
      <header class="window-title">
        <span>{t('window.map.title')}</span>
        <button type="button" class="window-close" aria-label={t('ui.close')} onClick={onClose}>
          x
        </button>
      </header>
      <div class="tower-map" onPointerDown={onPointerDown} onPointerMove={onPointerMove}>
        <canvas ref={pictureRef} width={MAP_WIDTH} height={MAP_HEIGHT} />
        <canvas ref={frameRef} width={MAP_WIDTH} height={MAP_HEIGHT} />
      </div>
    </section>
  );
}
