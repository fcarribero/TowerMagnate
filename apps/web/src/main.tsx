import { render } from 'preact';
import { SfxProvider } from './audio/useSfx';
import { App } from './ui/App';
import './style.css';

const root = document.getElementById('app');
if (root === null) {
  throw new Error('Missing #app element');
}
render(
  <SfxProvider>
    <App />
  </SfxProvider>,
  root,
);
