import { useEffect } from 'preact/hooks';
import { pageTitle } from '../index';
import { StageHost } from './StageHost';
import { t } from './strings';
import { useUiScale } from './uiScale';
import './kit';

export function App() {
  const { tooSmall } = useUiScale();

  useEffect(() => {
    document.title = pageTitle();
  }, []);

  if (tooSmall) {
    return <p class="viewport-too-small">{t('ui.viewportTooSmall')}</p>;
  }

  return (
    <>
      <StageHost />
      <div class="ui-layer">
        <div class="status-panel">{t('ui.serverOffline')}</div>
      </div>
    </>
  );
}
