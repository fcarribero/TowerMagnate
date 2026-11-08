import { describe, expect, it } from 'vitest';
import { diffInspectTargets, openInspectTargets } from './inspectTarget';

const win = (id: string) => ({ id, kind: id.split(':')[0] ?? '' });

describe('inspect targets of open windows', () => {
  it('lists every unit and elevator window and skips others', () => {
    const targets = openInspectTargets([win('unit:u1'), win('dialog:x'), win('elevator:s1')]);
    expect(targets).toEqual([
      { kind: 'unit', id: 'u1' },
      { kind: 'shaft', id: 's1' },
    ]);
  });

  it('keeps the five windows in front', () => {
    const ids = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'].map((id) => win(`unit:${id}`));
    expect(openInspectTargets(ids).map((target) => ('id' in target ? target.id : ''))).toEqual([
      'u2',
      'u3',
      'u4',
      'u5',
      'u6',
    ]);
  });

  it('removes only the closed window, newest or oldest', () => {
    const three = openInspectTargets([win('unit:u1'), win('unit:u2'), win('unit:u3')]);
    const withoutNewest = diffInspectTargets(three, three.slice(0, 2));
    expect(withoutNewest.removed).toEqual([{ kind: 'unit', id: 'u3' }]);
    expect(withoutNewest.added).toEqual([]);
    const withoutOldest = diffInspectTargets(three, three.slice(1));
    expect(withoutOldest.removed).toEqual([{ kind: 'unit', id: 'u1' }]);
  });

  it('adds only the new window', () => {
    const one = openInspectTargets([win('unit:u1')]);
    const two = openInspectTargets([win('unit:u1'), win('unit:u2')]);
    expect(diffInspectTargets(one, two).added).toEqual([{ kind: 'unit', id: 'u2' }]);
  });
});
