import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeAudioContext } from '../testing/fakeAudio';
import type { SfxManifest } from './sfxManifest';
import { SfxPlayer } from './sfxPlayer';
import { SfxProvider, useSfx } from './useSfx';

afterEach(cleanup);

const manifest: SfxManifest = {
  version: 1,
  effects: [
    {
      id: 'ui-click',
      files: { ogg: 'ui-click.ogg', mp3: 'ui-click.mp3' },
      volume: 0.5,
      loop: false,
      trigger: 'ui.click',
    },
  ],
};

function ClickButton() {
  const { playTrigger } = useSfx();
  return (
    <button type="button" onClick={() => playTrigger('ui.click')}>
      Construir
    </button>
  );
}

async function renderWithPlayer() {
  const context = new FakeAudioContext();
  const createAudioContext = vi.fn(() => context.asAudioContext());
  const player = new SfxPlayer({
    baseUrl: '/sfx/',
    format: 'mp3',
    fetchFile: () => Promise.resolve(new ArrayBuffer(8)),
    createAudioContext,
  });
  await player.setManifest(manifest);
  render(
    <SfxProvider player={player}>
      <ClickButton />
    </SfxProvider>,
  );
  return { context, createAudioContext, player };
}

describe('SfxProvider', () => {
  it('starts no audio context until the first gesture', async () => {
    const { createAudioContext } = await renderWithPlayer();
    expect(createAudioContext).not.toHaveBeenCalled();
  });

  it('unlocks on the first click and then plays by trigger', async () => {
    const { context, player } = await renderWithPlayer();
    const button = screen.getByRole('button', { name: 'Construir' });
    fireEvent.pointerDown(button);
    await waitFor(() => expect(player.unlocked).toBe(true));
    await waitFor(() => {
      fireEvent.click(button);
      expect(context.played).toHaveLength(1);
    });
  });

  it('is silent without a provider', () => {
    render(<ClickButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Construir' }));
  });
});
