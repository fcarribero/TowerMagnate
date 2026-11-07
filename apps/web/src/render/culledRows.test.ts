import { describe, expect, it } from 'vitest';
import { CulledRows } from './culledRows';

function rowsWithLevels(count: number) {
  const rows = new CulledRows<{ visible: boolean }>();
  const items = Array.from({ length: count }, () => ({ visible: true }));
  items.forEach((item, index) => rows.set(index, item));
  return { rows, items };
}

function visibleIndexes(items: { visible: boolean }[]): number[] {
  return items.flatMap((item, index) => (item.visible ? [index] : []));
}

describe('CulledRows', () => {
  it('hides every row until a range is shown', () => {
    const { items } = rowsWithLevels(5);
    expect(visibleIndexes(items)).toEqual([]);
  });

  it('shows only the rows inside the range', () => {
    const { rows, items } = rowsWithLevels(10);
    rows.showOnly({ lowest: 3, highest: 5 });
    expect(visibleIndexes(items)).toEqual([3, 4, 5]);
    rows.showOnly({ lowest: 5, highest: 7 });
    expect(visibleIndexes(items)).toEqual([5, 6, 7]);
  });

  it('shows a row added inside the current range', () => {
    const rows = new CulledRows<{ visible: boolean }>();
    rows.showOnly({ lowest: 0, highest: 2 });
    const inside = { visible: false };
    const outside = { visible: true };
    rows.set(1, inside);
    rows.set(4, outside);
    expect(inside.visible).toBe(true);
    expect(outside.visible).toBe(false);
  });

  it('counts only shown levels that have a row', () => {
    const rows = new CulledRows<{ visible: boolean }>();
    rows.set(2, { visible: false });
    rows.set(3, { visible: false });
    rows.set(9, { visible: false });
    expect(rows.drawnCount).toBe(0);
    rows.showOnly({ lowest: 0, highest: 5 });
    expect(rows.drawnCount).toBe(2);
  });
});
