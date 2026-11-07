import { useEffect, useMemo, useState } from 'preact/hooks';
import { pageTitle } from '../index';
import { TowerContentStore } from '../model/towerContent';
import { placeholderTowerContent } from '../render/placeholderTower';
import type { Stage } from '../render/stage';
import { isMapToggleKey } from './keys';
import { StageHost } from './StageHost';
import './kit';
import { t } from './strings';
import { TowerMapWindow } from './TowerMapWindow';
import { useUiScale } from './uiScale';

export function App() {
  const { tooSmall } = useUiScale();
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

  if (tooSmall) {
    return <p class="viewport-too-small">{t('ui.viewportTooSmall')}</p>;
  }

  return (
    <>
      <StageHost onStage={setStage} />
      <div class="ui-layer">
        <div class="status-panel">
          {t('ui.serverOffline')}
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
