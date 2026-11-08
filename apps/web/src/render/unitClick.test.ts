import { describe, expect, it } from 'vitest';
import { ClientStore } from '../model/clientStore';
import { snapshot } from '../testing/protocolFixtures';
import type { Cell } from './cellAtPoint';
import { bindUnitClicks } from './unitClick';

const office = {
  id: 'u1',
  type: 'office' as const,
  x: 10,
  level: 3,
  name: null,
  price: 'normal' as const,
  occupied: true,
  variant: 'occupied' as const,
};

function setup() {
  const store = new ClientStore({ requestResync: () => undefined, now: () => 0 });
  store.applySnapshot({ ...snapshot, units: [office] });
  let click: (cell: Cell) => void = () => undefined;
  const opened: string[] = [];
  bindUnitClicks(
    { onCellClick: (listener) => ((click = listener), () => undefined) },
    store,
    (id) => opened.push(id),
  );
  return { click: (cell: Cell) => click(cell), opened };
}

describe('bindUnitClicks', () => {
  it('opens the window of the unit under the click', () => {
    const { click, opened } = setup();
    click({ x: 10, level: 3 });
    expect(opened).toEqual(['u1']);
  });

  it('ignores a click on an empty cell', () => {
    const { click, opened } = setup();
    click({ x: 0, level: 3 });
    expect(opened).toEqual([]);
  });
});
