import { describe, expect, it } from 'vitest';
import { ClientStore } from '../model/clientStore';
import { snapshot } from '../testing/protocolFixtures';
import type { Cell } from './cellAtPoint';
import type { CellInput } from './stage';
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
  let input: (event: CellInput) => void = () => undefined;
  const opened: string[] = [];
  bindUnitClicks(
    { onCellInput: (listener) => ((input = listener), () => undefined) },
    store,
    (id) => opened.push(id),
  );
  const press = (cell: Cell | null, upOffset = 0): void => {
    input({ kind: 'down', cell, clientX: 100, clientY: 100 });
    input({ kind: 'up', cell, clientX: 100 + upOffset, clientY: 100 });
  };
  return { click: (cell: Cell) => press(cell), press, opened };
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

  it('ignores a press that dragged the view', () => {
    const { press, opened } = setup();
    press({ x: 10, level: 3 }, 20);
    expect(opened).toEqual([]);
  });
});
