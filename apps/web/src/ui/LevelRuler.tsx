import { TOWER_LAYOUT, type Level } from '@tower-magnate/shared';
import { useEffect, useState } from 'preact/hooks';
import { rulerMarks, type RulerMark } from '../render/levelRuler';
import type { Stage } from '../render/stage';

const LOBBY_FLOORS: ReadonlySet<Level> = new Set<Level>([
  TOWER_LAYOUT.mainLobbyFloor,
  ...TOWER_LAYOUT.skyLobbyFloors,
]);

interface LevelRulerProps {
  stage: Stage;
  side: 'left' | 'right';
}

/** Floor numbers in white down one side edge of the tower view, one per visible level. */
export function LevelRuler({ stage, side }: LevelRulerProps) {
  const [marks, setMarks] = useState<RulerMark[]>(() => rulerMarks(stage.camera()));

  useEffect(() => {
    setMarks(rulerMarks(stage.camera()));
    return stage.onCameraChange((camera) => setMarks(rulerMarks(camera)));
  }, [stage]);

  const cssScale = stage.cssPerDevicePixel();
  return (
    <div class={`level-ruler is-${side}`} aria-hidden="true">
      {marks.map((mark) => (
        <div
          key={mark.level}
          class={LOBBY_FLOORS.has(mark.level) ? 'level-ruler-mark is-lobby' : 'level-ruler-mark'}
          style={{ top: `${mark.top * cssScale}px`, height: `${mark.height * cssScale}px` }}
        >
          {mark.label}
        </div>
      ))}
    </div>
  );
}
