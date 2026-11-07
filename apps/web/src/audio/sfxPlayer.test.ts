import { describe, expect, it, vi } from 'vitest';
import { FakeAudioContext } from '../testing/fakeAudio';
import type { SfxManifest } from './sfxManifest';
import { SfxPlayer, unlockOnFirstGesture } from './sfxPlayer';

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
    {
      id: 'lobby-ambience',
      files: { ogg: 'lobby-ambience.ogg', mp3: 'lobby-ambience.mp3' },
      volume: 0.5,
      loop: true,
      trigger: 'ambience.lobby',
    },
  ],
};

function setup() {
  const context = new FakeAudioContext();
  const createAudioContext = vi.fn(() => context.asAudioContext());
  const fetchFile = vi.fn((url: string) => Promise.resolve(new ArrayBuffer(url.length)));
  const warn = vi.fn();
  const player = new SfxPlayer({
    baseUrl: '/sfx/',
    format: 'ogg',
    fetchFile,
    createAudioContext,
    warn,
  });
  return { player, context, createAudioContext, fetchFile, warn };
}

describe('SfxPlayer', () => {
  it('downloads every effect in the chosen format', async () => {
    const { player, fetchFile } = setup();
    await player.setManifest(manifest);
    expect(fetchFile.mock.calls.map(([url]) => url)).toEqual([
      '/sfx/construction.ogg',
      '/sfx/lobby-ambience.ogg',
    ]);
  });

  it('creates no audio context before unlock', async () => {
    const { player, createAudioContext } = setup();
    await player.setManifest(manifest);
    player.playSfx('construction');
    expect(createAudioContext).not.toHaveBeenCalled();
    expect(player.unlocked).toBe(false);
  });

  it('plays with the manifest volume and loop after unlock', async () => {
    const { player, context } = setup();
    await player.setManifest(manifest);
    await player.unlock();
    player.playSfx('construction');
    player.playSfx('lobby-ambience');
    expect(context.state).toBe('running');
    expect(context.played.map(({ volume, loop }) => ({ volume, loop }))).toEqual([
      { volume: 0.8, loop: false },
      { volume: 0.5, loop: true },
    ]);
  });

  it('decodes files that arrive after unlock', async () => {
    const { player, context } = setup();
    await player.unlock();
    await player.setManifest(manifest);
    player.playSfx('construction');
    expect(context.played).toHaveLength(1);
  });

  it('creates one audio context however often it is unlocked', async () => {
    const { player, createAudioContext } = setup();
    await player.unlock();
    await player.unlock();
    expect(createAudioContext).toHaveBeenCalledTimes(1);
  });

  it('stops a sound through its handle', async () => {
    const { player, context } = setup();
    await player.setManifest(manifest);
    await player.unlock();
    player.playSfx('lobby-ambience').stop();
    expect(context.played[0]?.stopped).toBe(true);
  });

  it('logs an unknown id once and plays nothing', async () => {
    const { player, context, warn } = setup();
    await player.setManifest(manifest);
    await player.unlock();
    player.playSfx('kazoo');
    player.playSfx('kazoo');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('Unknown sound effect "kazoo"');
    expect(context.played).toHaveLength(0);
  });

  it('stays quiet before the manifest is loaded', () => {
    const { player, warn } = setup();
    player.playSfx('construction');
    expect(warn).not.toHaveBeenCalled();
  });

  it('skips an effect whose file failed to load', async () => {
    const { player, context, fetchFile, warn } = setup();
    fetchFile.mockRejectedValueOnce(new Error('404'));
    await player.setManifest(manifest);
    await player.unlock();
    player.playSfx('construction');
    expect(context.played).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('construction'));
  });

  it('scales every effect by the master gain', async () => {
    const { player, context } = setup();
    await player.setManifest(manifest);
    await player.unlock();
    player.setMasterGain(0.5);
    player.playSfx('construction');
    expect(context.played[0]?.volume).toBeCloseTo(0.4);
  });

  it('plays no one-shot effect at master gain 0', async () => {
    const { player, context } = setup();
    await player.setManifest(manifest);
    await player.unlock();
    player.setMasterGain(0);
    player.playSfx('construction');
    expect(context.played).toHaveLength(0);
  });

  it('applies a new master gain to loops already playing', async () => {
    const { player, context } = setup();
    await player.setManifest(manifest);
    await player.unlock();
    player.playSfx('lobby-ambience');
    player.setMasterGain(0);
    expect(context.played[0]?.volume).toBe(0);
    player.setMasterGain(0.6);
    expect(context.played[0]?.volume).toBeCloseTo(0.3);
  });

  it('finds the id for a trigger', async () => {
    const { player } = setup();
    await player.setManifest(manifest);
    expect(player.idForTrigger('build.place')).toBe('construction');
    expect(player.idForTrigger('nothing')).toBeUndefined();
  });
});

describe('unlockOnFirstGesture', () => {
  it('unlocks on the first key press only', () => {
    const unlock = vi.fn();
    unlockOnFirstGesture(window, unlock);
    window.dispatchEvent(new KeyboardEvent('keydown'));
    window.dispatchEvent(new PointerEvent('pointerdown'));
    expect(unlock).toHaveBeenCalledTimes(1);
  });

  it('unlocks on the first click', () => {
    const unlock = vi.fn();
    unlockOnFirstGesture(window, unlock);
    window.dispatchEvent(new PointerEvent('pointerdown'));
    expect(unlock).toHaveBeenCalledTimes(1);
  });

  it('does nothing without a gesture or after it is removed', () => {
    const unlock = vi.fn();
    const remove = unlockOnFirstGesture(window, unlock);
    window.dispatchEvent(new Event('load'));
    remove();
    window.dispatchEvent(new PointerEvent('pointerdown'));
    expect(unlock).not.toHaveBeenCalled();
  });
});
