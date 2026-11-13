import { describe, expect, it } from 'vitest';
import { expectedEntries, fileNameFor, missingFiles, viewportFor } from './plan';

const screens = [
  { id: 'login', state: 'logged out' },
  { id: 'game', state: 'verticalSlice tower' },
];

describe('ui sweep plan', () => {
  it('gives each step its own viewport', () => {
    expect(viewportFor(1)).toEqual({ width: 1024, height: 640 });
    expect(viewportFor(2)).toEqual({ width: 1920, height: 1200 });
    expect(viewportFor(3)).toEqual({ width: 2560, height: 1600 });
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
