import { useEffect, useMemo, useState } from 'preact/hooks';
import { pageTitle } from '../index';
import { TowerContentStore } from '../model/towerContent';
import { placeholderTowerContent } from '../render/placeholderTower';
import type { Stage } from '../render/stage';
import { isMapToggleKey } from './keys';
import { StageHost } from './StageHost';
import { TowerMapWindow } from './TowerMapWindow';

export function App() {
  const content = useMemo(() => {
    const store = new TowerContentStore();
    store.applySnapshot(placeholderTowerContent());
    return store;
  }, []);
  const [stage, setStage] = useState<Stage | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const toggleMap = (): void => setMapOpen((open) => !open);

  useEffect(() => {
    document.title = pageTitle();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isMapToggleKey(event)) {
        setMapOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <>
      <StageHost onStage={setStage} />
      <div class="ui-layer">
        <div class="status-panel">
          Sin conexión con el servidor
          <button type="button" class="status-button" onClick={toggleMap}>
            Mapa
          </button>
        </div>
        {mapOpen && stage && (
          <TowerMapWindow content={content} stage={stage} onClose={() => setMapOpen(false)} />
        )}
      </div>
    </>
  );
}
