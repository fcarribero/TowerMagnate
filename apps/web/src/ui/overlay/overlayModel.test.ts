import { describe, expect, it } from 'vitest';
import { hasString } from '../strings';
import { legendOf, overlayForKey } from './overlayModel';

describe('overlayForKey', () => {
  it('maps keys 1 to 6 to the overlays in order', () => {
    expect(['1', '2', '3', '4', '5', '6'].map(overlayForKey)).toEqual([
      'normal',
      'evaluation',
      'price',
      'hotel',
      'noise',
      'dirt',
    ]);
  });

  it('ignores other keys', () => {
    expect(['0', '7', 'a', ''].map(overlayForKey)).toEqual([null, null, null, null]);
  });
});

describe('legendOf', () => {
  it('has no lines in Normal', () => {
    expect(legendOf('normal')).toEqual([]);
  });

  it('lists 4 labeled colors for each other overlay', () => {
    for (const id of ['evaluation', 'price', 'hotel'] as const) {
      const entries = legendOf(id);
      expect(entries).toHaveLength(4);
      expect(entries.every((entry) => hasString(entry.label))).toBe(true);
    }
  });

  it('lists 3 labeled heat steps for noise and dirt', () => {
    for (const id of ['noise', 'dirt'] as const) {
      const entries = legendOf(id);
      expect(entries).toHaveLength(3);
      expect(entries.every((entry) => hasString(entry.label))).toBe(true);
    }
  });

  it('matches the section 7 colors', () => {
    expect(legendOf('evaluation').map((entry) => entry.color)).toEqual([
      'sky-deep',
      'lamp',
      'cloth-red',
      'gray',
    ]);
    expect(legendOf('hotel').map((entry) => entry.color)).toEqual([
      'leaf',
      'sky-deep',
      'dusk',
      'cloth-red',
    ]);
  });
});
