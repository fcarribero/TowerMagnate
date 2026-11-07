import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import type { SfxManifest } from '../../audio/sfxManifest';
import { SfxPlayer } from '../../audio/sfxPlayer';
import { browserSettingsStore, type SettingsStore } from '../../audio/soundSettings';
import { SfxProvider, useSfx } from '../../audio/useSfx';
import { FakeAudioContext } from '../../testing/fakeAudio';
import { GameMenu } from './GameMenu';

afterEach(cleanup);

const manifest: SfxManifest = {
  version: 1,
  effects: [
    {
      id: 'construction',
      files: { ogg: 'construction.ogg', mp3: 'construction.mp3' },
      volume: 0.8,
      loop: false,
      trigger: 'build.place',
    },
  ],
};

function BuildButton() {
  const { playSfx } = useSfx();
  return (
    <button type="button" onClick={() => playSfx('construction')}>
      Construir
    </button>
  );
}

function memoryStore(): SettingsStore {
  let saved: string | null = null;
  return {
    read: () => saved,
    write: (value) => {
      saved = value;
    },
  };
}

async function renderGame(store: SettingsStore) {
  const context = new FakeAudioContext();
  const player = new SfxPlayer({
    baseUrl: '/sfx/',
    format: 'mp3',
    fetchFile: () => Promise.resolve(new ArrayBuffer(8)),
    createAudioContext: () => context.asAudioContext(),
  });
  await player.setManifest(manifest);
  await player.unlock();
  const view = render(
    <SfxProvider player={player} settingsStore={store}>
      <GameMenu onRestartTower={() => {}} onLogout={() => {}} />
      <BuildButton />
    </SfxProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Menú' }));
  return { context, view };
}

function build(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Construir' }));
}

function volumeSlider(): HTMLInputElement {
  return screen.getByRole('slider') as HTMLInputElement;
}

describe('GameMenu sound settings', () => {
  it('starts with sound on at volume 70', async () => {
    const { context } = await renderGame(memoryStore());
    expect(screen.getByRole('menuitem', { name: /Sonido/ }).textContent).toBe('Sonido: sí');
    expect(volumeSlider().value).toBe('70');
    build();
    await waitFor(() => expect(context.played[0]?.volume).toBeCloseTo(0.8 * 0.7));
  });

  it('plays nothing while muted', async () => {
    const { context } = await renderGame(memoryStore());
    fireEvent.click(screen.getByRole('menuitem', { name: /Sonido/ }));
    expect(screen.getByRole('menuitem', { name: /Sonido/ }).textContent).toBe('Sonido: no');
    build();
    expect(context.played).toHaveLength(0);
  });

  it('scales the effect gain with the volume', async () => {
    const { context } = await renderGame(memoryStore());
    fireEvent.input(volumeSlider(), { target: { value: '25' } });
    await waitFor(() => {
      build();
      expect(context.played.at(-1)?.volume).toBeCloseTo(0.8 * 0.25);
    });
  });

  it('keeps mute and volume after a reload', async () => {
    const store = memoryStore();
    const first = await renderGame(store);
    fireEvent.input(volumeSlider(), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('menuitem', { name: /Sonido/ }));
    first.view.unmount();

    const { context } = await renderGame(store);
    expect(screen.getByRole('menuitem', { name: /Sonido/ }).textContent).toBe('Sonido: no');
    expect(volumeSlider().value).toBe('40');
    build();
    expect(context.played).toHaveLength(0);
  });

  it('still works for the session when local storage is blocked', async () => {
    const blocked = browserSettingsStore(() => {
      throw new DOMException('Access is denied', 'SecurityError');
    });
    const { context } = await renderGame(blocked);
    fireEvent.click(screen.getByRole('menuitem', { name: /Sonido/ }));
    build();
    expect(context.played).toHaveLength(0);
    fireEvent.click(screen.getByRole('menuitem', { name: /Sonido/ }));
    await waitFor(() => {
      build();
      expect(context.played.length).toBeGreaterThan(0);
    });
  });

  it('closes with Escape', async () => {
    await renderGame(memoryStore());
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
