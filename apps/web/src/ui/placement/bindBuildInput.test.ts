import type { Command } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import type { Cell } from '../../render/cellAtPoint';
import type { CellInput } from '../../render/stage';
import type { ToolId } from '../toolbar/toolbarModel';
import { bindBuildInput } from './bindBuildInput';

function setup(
  tool: ToolId,
  lobbyHeight = 1,
  extra: {
    shaftAt?: (cell: Cell) => string | null;
    lobbyHeightAt?: (level: number) => number | null;
  } = {},
) {
  let onInput: (input: CellInput) => void = () => {};
  let onHover: (cell: Cell | null) => void = () => {};
  const runs: unknown[] = [];
  const sent: Command[] = [];
  const outcomes: unknown[] = [];
  const labels: unknown[] = [];
  const keys = new EventTarget();
  bindBuildInput({
    stage: {
      onCellInput: (listener) => {
        onInput = listener;
        return () => {};
      },
      onHoverCell: (listener) => {
        onHover = listener;
        return () => {};
      },
      showRun: (run) => void runs.push(run),
    },
    api: {
      send: (command) => {
        sent.push(command);
        return Promise.resolve({ ok: true, cost: 10, refund: 0 });
      },
    },
    tool,
    lobbyHeight,
    ...extra,
    onDragLabel: (label) => void labels.push(label),
    onOutcome: (outcome) => void outcomes.push(outcome),
    keyTarget: keys as unknown as Window,
  });
  return {
    input: (kind: CellInput['kind'], cell: Cell | null) =>
      onInput({ kind, cell, clientX: 5, clientY: 6 }),
    hover: (cell: Cell | null) => onHover(cell),
    pressEscape: () => {
      const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
      keys.dispatchEvent(event);
      return event;
    },
    move: (clientX: number, clientY: number) =>
      keys.dispatchEvent(new MouseEvent('pointermove', { clientX, clientY })),
    labels,
    sent,
    runs,
    outcomes,
  };
}

describe('bindBuildInput', () => {
  it('sends one buildFloor for a drag', () => {
    const t = setup('floor');
    t.input('down', { x: 2, level: 3 });
    t.hover({ x: 5, level: 3 });
    t.hover({ x: 8, level: 3 });
    t.input('up', { x: 8, level: 3 });
    expect(t.sent).toEqual([{ type: 'buildFloor', level: 3, x0: 2, x1: 8 }]);
  });

  it('shows the dragged run and clears it on release', () => {
    const t = setup('floor');
    t.input('down', { x: 2, level: 3 });
    t.hover({ x: 4, level: 3 });
    expect(t.runs.at(-1)).toMatchObject({ x: 2, width: 3, level: 3 });
    t.input('up', { x: 4, level: 3 });
    expect(t.runs.at(-1)).toBeNull();
  });

  it('cancels a drag with a right click and sends nothing', () => {
    const t = setup('floor');
    t.input('down', { x: 2, level: 3 });
    t.input('cancel', null);
    t.input('up', { x: 6, level: 3 });
    expect(t.sent).toEqual([]);
  });

  it('cancels a drag with Esc and keeps the tool', () => {
    const t = setup('floor');
    t.input('down', { x: 1, level: 2 });
    const escape = t.pressEscape();
    t.input('up', { x: 4, level: 2 });
    expect(escape.defaultPrevented).toBe(true);
    expect(t.sent).toEqual([]);
  });

  it('lets Esc through when no drag is active', () => {
    const t = setup('floor');
    expect(t.pressEscape().defaultPrevented).toBe(false);
  });

  it('sends buildUnit on click and reports the outcome', async () => {
    const t = setup('office');
    t.input('down', { x: 7, level: 4 });
    expect(t.sent).toEqual([{ type: 'buildUnit', unitType: 'office', x: 7, level: 4 }]);
    await Promise.resolve();
    expect(t.outcomes).toEqual([{ ok: true, cost: 10, refund: 0 }]);
  });

  it('does nothing with the inspect tool', () => {
    const t = setup('inspect');
    t.input('down', { x: 7, level: 4 });
    t.input('up', { x: 7, level: 4 });
    expect(t.sent).toEqual([]);
  });

  it('sends buildShaft from the lowest to the highest dragged level', () => {
    const t = setup('standard-elevator');
    t.input('down', { x: 30, level: 10 });
    t.hover({ x: 30, level: 4 });
    t.input('up', { x: 30, level: 4 });
    expect(t.sent).toEqual([
      { type: 'buildShaft', shaftType: 'standard', x: 30, bottom: 4, top: 10 },
    ]);
  });

  it('draws the shaft ghost green up to 30 levels and red past that', () => {
    const t = setup('standard-elevator');
    t.input('down', { x: 30, level: 1 });
    t.hover({ x: 30, level: 30 });
    expect(t.runs.at(-1)).toMatchObject({ level: 1, floors: 30, valid: true });
    t.hover({ x: 30, level: 31 });
    expect(t.runs.at(-1)).toMatchObject({ floors: 31, valid: false });
  });

  it('does not count level 0 when sizing a shaft', () => {
    const t = setup('standard-elevator');
    t.input('down', { x: 30, level: -2 });
    t.hover({ x: 30, level: 2 });
    expect(t.runs.at(-1)).toMatchObject({ level: -2, floors: 4 });
  });

  it('shows floors and cost at the pointer while a shaft is dragged', () => {
    const t = setup('standard-elevator');
    t.input('down', { x: 30, level: 1 });
    t.move(40, 50);
    t.hover({ x: 30, level: 3 });
    expect(t.labels.at(-1)).toEqual({
      floors: 3,
      cost: 280_000,
      valid: true,
      at: { x: 40, y: 50 },
    });
    t.input('cancel', null);
    expect(t.labels.at(-1)).toBeNull();
  });

  it('cancels a shaft drag with Esc', () => {
    const t = setup('service-elevator');
    t.input('down', { x: 30, level: 1 });
    t.pressEscape();
    t.input('up', { x: 30, level: 5 });
    expect(t.sent).toEqual([]);
  });

  it('sends addCar for a click on a shaft at its home level', () => {
    const t = setup('car', 1, { shaftAt: () => 's4' });
    t.input('down', { x: 31, level: 7 });
    expect(t.sent).toEqual([{ type: 'addCar', shaftId: 's4', homeLevel: 7 }]);
  });

  it('sends nothing for a car click outside a shaft', () => {
    const t = setup('car', 1, { shaftAt: () => null });
    t.input('down', { x: 31, level: 7 });
    expect(t.sent).toEqual([]);
  });

  it('builds a lobby at the height already fixed on that level', () => {
    const t = setup('lobby', 1, { lobbyHeightAt: (level) => (level === 1 ? 3 : null) });
    t.input('down', { x: 2, level: 1 });
    t.input('up', { x: 4, level: 1 });
    expect(t.sent).toEqual([{ type: 'buildLobby', level: 1, x0: 2, x1: 4, height: 3 }]);
  });
});
