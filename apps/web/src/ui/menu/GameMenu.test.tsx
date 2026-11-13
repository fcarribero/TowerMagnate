import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import type { SfxManifest } from '../../audio/sfxManifest';
import { SfxPlayer } from '../../audio/sfxPlayer';
import { browserSettingsStore, type SettingsStore } from '../../audio/soundSettings';
import { SfxProvider, useSfx } from '../../audio/useSfx';
import { FakeAudioContext } from '../../testing/fakeAudio';
import { GameMenu, type MenuItem } from './GameMenu';

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
      stopTrigger: null,
      minIntervalMs: 0,
      duckOthers: null,
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

async function renderGame(
  store: SettingsStore,
  items: readonly MenuItem[] = [],
  onLogout?: () => void,
) {
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
      <GameMenu items={items} onLogout={onLogout} />
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
    expect(screen.getByRole('menuitem').textContent).toBe('Sonido: sí');
    expect(volumeSlider().value).toBe('70');
    build();
    await waitFor(() => expect(context.played[0]?.volume).toBeCloseTo(0.8 * 0.7));
  });

  it('plays nothing while muted', async () => {
    const { context } = await renderGame(memoryStore());
    fireEvent.click(screen.getByRole('menuitem'));
    expect(screen.getByRole('menuitem').textContent).toBe('Sonido: no');
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
    fireEvent.click(screen.getByRole('menuitem'));
    first.view.unmount();

    const { context } = await renderGame(store);
    expect(screen.getByRole('menuitem').textContent).toBe('Sonido: no');
    expect(volumeSlider().value).toBe('40');
    build();
    expect(context.played).toHaveLength(0);
  });

  it('still works for the session when local storage is blocked', async () => {
    const blocked = browserSettingsStore(() => {
      throw new DOMException('Access is denied', 'SecurityError');
    });
    const { context } = await renderGame(blocked);
    fireEvent.click(screen.getByRole('menuitem'));
    build();
    expect(context.played).toHaveLength(0);
    fireEvent.click(screen.getByRole('menuitem'));
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

  it('closes on a click outside the list', async () => {
    await renderGame(memoryStore());
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Construir' }));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('stays open on a click inside the list', async () => {
    await renderGame(memoryStore());
    fireEvent.pointerDown(screen.getByRole('menu'));
    expect(screen.queryByRole('menu')).not.toBeNull();
  });

  it('draws a line before the new tower item and before logout only', async () => {
    const newTower: MenuItem = {
      id: 'newTower',
      label: 'Empezar una torre nueva',
      separated: true,
      onSelect: () => undefined,
    };
    const stars: MenuItem = { id: 'stars', label: 'Avisos', onSelect: () => undefined };
    await renderGame(memoryStore(), [stars, newTower], () => undefined);
    const separated = screen
      .getAllByRole('menuitem')
      .filter((item) => item.classList.contains('is-separated'))
      .map((item) => item.textContent);
    expect(separated).toEqual(['Empezar una torre nueva', 'Cerrar sesión']);
  });

  it('moves focus between rows with the arrow keys', async () => {
    await renderGame(memoryStore(), [], () => undefined);
    const [first] = screen.getAllByRole('menuitem');
    (first as HTMLElement).focus();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Cerrar sesión' }));
  });
});

describe('GameMenu entries with children', () => {
  const debug: MenuItem = {
    id: 'debug',
    label: 'Debug',
    onSelect: () => undefined,
    children: <input type="checkbox" aria-label="Dinero infinito" />,
  };

  it('shows the child entries only after the item is clicked, and keeps the menu open', () => {
    render(<GameMenu items={[debug]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Menú' }));
    expect(screen.queryByLabelText('Dinero infinito')).toBeNull();
    fireEvent.click(screen.getByRole('menuitem', { name: /Debug/ }));
    expect(screen.getByLabelText('Dinero infinito')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Dinero infinito'));
    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: /Debug/ }));
    expect(screen.queryByLabelText('Dinero infinito')).toBeNull();
  });
});
