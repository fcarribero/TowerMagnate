import { useEffect } from 'preact/hooks';
import { pageTitle } from '../index';
import { StageHost } from './StageHost';
import { t } from './strings';

export function App() {
  useEffect(() => {
    document.title = pageTitle();
  }, []);

  return (
    <>
      <StageHost />
      <div class="ui-layer">
        <div class="status-panel">{t('ui.serverOffline')}</div>
      </div>
    </>
  );
}
