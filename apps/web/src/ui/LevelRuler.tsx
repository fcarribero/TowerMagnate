import { useEffect, useState } from 'preact/hooks';
import { rulerMarks, type RulerMark } from '../render/levelRuler';
import type { Stage } from '../render/stage';

interface LevelRulerProps {
  stage: Stage;
}

/** Floor numbers in white down the left edge of the tower view, one per visible level. */
export function LevelRuler({ stage }: LevelRulerProps) {
  const [marks, setMarks] = useState<RulerMark[]>(() => rulerMarks(stage.camera()));

  useEffect(() => {
    setMarks(rulerMarks(stage.camera()));
    return stage.onCameraChange((camera) => setMarks(rulerMarks(camera)));
  }, [stage]);

  const cssScale = stage.cssPerDevicePixel();
  return (
    <div class="level-ruler" aria-hidden="true">
      {marks.map((mark) => (
        <div
          key={mark.level}
          class="level-ruler-mark"
          style={{ top: `${mark.top * cssScale}px`, height: `${mark.height * cssScale}px` }}
        >
          {mark.label}
        </div>
      ))}
    </div>
  );
}
