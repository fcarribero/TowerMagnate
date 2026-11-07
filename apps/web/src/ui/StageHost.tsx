import { useEffect, useRef, useState } from 'preact/hooks';
import { mountStage, type RenderStats, type Stage } from '../render/stage';

interface StageHostProps {
  onStage?: (stage: Stage | null) => void;
}

export function StageHost({ onStage }: StageHostProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [stats, setStats] = useState<RenderStats | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) {
      return;
    }
    let stage: Stage | undefined;
    let unmounted = false;

    mountStage(host, { onStats: setStats }).then(
      (mounted) => {
        if (unmounted) {
          mounted.destroy();
        } else {
          stage = mounted;
          setLoadState('ready');
          onStage?.(mounted);
        }
      },
      (error: unknown) => {
        console.error('Could not start the tower view', error);
        if (!unmounted) {
          setLoadState('failed');
        }
      },
    );

    return () => {
      unmounted = true;
      onStage?.(null);
      stage?.destroy();
    };
  }, [onStage]);

  return (
    <>
      <div class="stage-host" ref={hostRef} />
      {loadState === 'loading' && <div class="stage-message">Cargando gráficos…</div>}
      {loadState === 'failed' && (
        <div class="stage-message">No se pudieron cargar los gráficos. Recargá la página.</div>
      )}
      {stats && (
        <div class="render-stats">
          {stats.fps} FPS · Zoom {stats.zoom}x · Pisos dibujados: {stats.floorsDrawn}
        </div>
      )}
    </>
  );
}
