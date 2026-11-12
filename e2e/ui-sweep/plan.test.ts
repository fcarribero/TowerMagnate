import { describe, expect, it } from 'vitest';
import { expectedEntries, fileNameFor, missingFiles, viewportFor } from './plan';

const screens = [
  { id: 'login', state: 'logged out' },
  { id: 'game', state: 'verticalSlice tower' },
];

describe('ui sweep plan', () => {
  it('sizes the viewport from the UI scale', () => {
    expect(viewportFor(1)).toEqual({ width: 1024, height: 640 });
    expect(viewportFor(2)).toEqual({ width: 2048, height: 1280 });
    expect(viewportFor(3)).toEqual({ width: 3072, height: 1920 });
  });

  it('names files screen-scale-fonts', () => {
    expect(fileNameFor('login', 2, 'nofonts')).toBe('login-2-nofonts.png');
  });

  it('lists every screen at 3 scales and 2 font modes', () => {
    const entries = expectedEntries(screens);
    expect(entries).toHaveLength(12);
    expect(new Set(entries.map((entry) => entry.file)).size).toBe(12);
    expect(entries[0]).toMatchObject({ screen: 'login', scale: 1, fonts: 'fonts' });
  });

  it('reports the files that were not written', () => {
    const entries = expectedEntries(screens);
    const present = entries
      .map((entry) => entry.file)
      .filter((file) => file !== 'game-3-nofonts.png');
    expect(missingFiles(entries, present)).toEqual(['game-3-nofonts.png']);
  });
});
