import { useEffect, useRef } from 'preact/hooks';
import { mountStage, type Stage } from '../render/stage';

export function StageHost() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) {
      return;
    }
    let stage: Stage | undefined;
    let unmounted = false;

    void mountStage(host).then((mounted) => {
      if (unmounted) {
        mounted.destroy();
      } else {
        stage = mounted;
      }
    });

    return () => {
      unmounted = true;
      stage?.destroy();
    };
  }, []);

  return <div class="stage-host" ref={hostRef} />;
}
