import { Texture } from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpriteRegistry } from './spriteRegistry';

// jsdom has no WebGL: a stand-in Application whose destroy frees the display tree like the real one.
vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>();
  class FakeApplication {
    stage = new pixi.Container();
    canvas = document.createElement('canvas');
    renderer = { width: 1, height: 1, resize: () => {}, render: () => {} };
    ticker = { add: () => {}, remove: () => {} };
    async init(): Promise<void> {}
    destroy(): void {
      this.stage.destroy({ children: true });
    }
  }
  return { ...pixi, Application: FakeApplication };
});
// The sky gradient is drawn on a 2d canvas, which jsdom also lacks.
vi.mock('./skyRows', async (importOriginal) => {
  const rows = await importOriginal<typeof import('./skyRows')>();
  return { ...rows, createSky: () => rows.createSky('day', () => new Texture()) };
});
vi.mock('./atlasLoader', () => ({
  loadSprites: async () => new SpriteRegistry(Texture.EMPTY, () => undefined),
}));

const { mountStage } = await import('./stage');

describe('stage after destroy', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        disconnect(): void {}
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ignores selection calls from panels that unmount after it', async () => {
    const stage = await mountStage(document.createElement('div'));
    stage.destroy();
    expect(() => stage.showSelection([])).not.toThrow();
    expect(() => stage.showPersonSelection(null)).not.toThrow();
  });
});
