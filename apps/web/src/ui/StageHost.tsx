import { useEffect, useRef, useState } from 'preact/hooks';
import { mountStage, type RenderStats, type Stage } from '../render/stage';

interface StageHostProps {
  onStage?: (stage: Stage | null) => void;
}

export function StageHost({ onStage }: StageHostProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [stats, setStats] = useState<RenderStats | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) {
      return;
    }
    let stage: Stage | undefined;
    let unmounted = false;

    void mountStage(host, { onStats: setStats }).then((mounted) => {
      if (unmounted) {
        mounted.destroy();
      } else {
        stage = mounted;
        onStage?.(mounted);
      }
    });

    return () => {
      unmounted = true;
      onStage?.(null);
      stage?.destroy();
    };
  }, [onStage]);

  return (
    <>
      <div class="stage-host" ref={hostRef} />
      {stats && (
        <div class="render-stats">
          {stats.fps} FPS · Zoom {stats.zoom}x · Pisos dibujados: {stats.floorsDrawn}
        </div>
      )}
    </>
  );
}
