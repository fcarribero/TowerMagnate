import { useEffect } from 'preact/hooks';
import { pageTitle } from '../index';
import { StageHost } from './StageHost';

export function App() {
  useEffect(() => {
    document.title = pageTitle();
  }, []);

  return (
    <>
      <StageHost />
      <div class="ui-layer">
        <div class="status-panel">Sin conexión con el servidor</div>
      </div>
    </>
  );
}
