import type { Level } from '@tower-magnate/shared';
import { useEffect, useState } from 'preact/hooks';
import { rulerMarks, type RulerMark } from '../render/levelRuler';
import type { Stage } from '../render/stage';

interface LevelRulerProps {
  stage: Stage;
}

/** Level labels down the left edge of the tower view, with the hovered level lit. */
export function LevelRuler({ stage }: LevelRulerProps) {
  const [marks, setMarks] = useState<RulerMark[]>(() => rulerMarks(stage.camera()));
  const [hovered, setHovered] = useState<Level | null>(null);

  useEffect(() => {
    setMarks(rulerMarks(stage.camera()));
    const stopCamera = stage.onCameraChange((camera) => setMarks(rulerMarks(camera)));
    const stopHover = stage.onHoverLevel(setHovered);
    return () => {
      stopCamera();
      stopHover();
    };
  }, [stage]);

  const cssScale = stage.cssPerDevicePixel();
  return (
    <div class="level-ruler" aria-hidden="true">
      {marks.map((mark) => (
        <div
          key={mark.level}
          class={mark.level === hovered ? 'level-ruler-mark is-hovered' : 'level-ruler-mark'}
          style={{ top: `${mark.top * cssScale}px`, height: `${mark.height * cssScale}px` }}
        >
          <span class="level-ruler-tag">{mark.label}</span>
        </div>
      ))}
    </div>
  );
}
