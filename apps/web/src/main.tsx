import { render } from 'preact';
import { SfxProvider } from './audio/useSfx';
import { fontsReady } from './ui/fontsReady';
import { Root } from './ui/Root';
import './style.css';

const root = document.getElementById('app');
if (root === null) {
  throw new Error('Missing #app element');
}
void fontsReady().then(() => {
  render(
    <SfxProvider>
      <Root />
    </SfxProvider>,
    root,
  );
});
