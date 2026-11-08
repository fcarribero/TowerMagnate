import type { Command } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import type { Cell } from '../../render/cellAtPoint';
import type { CellInput } from '../../render/stage';
import { bindDemolishInput } from './bindDemolishInput';
import type { Confirmation, DemolishWorld } from './demolishPlan';

function setup(units: DemolishWorld['units'] = []) {
  let onInput: (input: CellInput) => void = () => {};
  let onHover: (cell: Cell | null) => void = () => {};
  const sent: Command[] = [];
  const asked: Confirmation[] = [];
  const answers: Array<() => void> = [];
  const frames: unknown[] = [];
  const keys = new EventTarget();
  bindDemolishInput({
    stage: {
      onCellInput: (listener) => {
        onInput = listener;
        return () => {};
      },
      onHoverCell: (listener) => {
        onHover = listener;
        return () => {};
      },
      showHighlight: (frame) => void frames.push(frame),
    },
    api: {
      send: (command) => {
        sent.push(command);
        return Promise.resolve({ ok: true, cost: 0, refund: 500 });
      },
    },
    world: () => ({
      structure: new Map([[2, 'f'.repeat(40)]]),
      units,
      transports: [],
      shafts: [],
      cars: [],
    }),
    confirm: (confirmation, proceed) => {
      asked.push(confirmation);
      answers.push(proceed);
    },
    onOutcome: () => {},
    keyTarget: keys as unknown as Window,
  });
  return {
    input: (kind: CellInput['kind'], cell: Cell | null) =>
      onInput({ kind, cell, clientX: 1, clientY: 2 }),
    hover: (cell: Cell | null) => onHover(cell),
    escape: () => keys.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })),
    sent,
    asked,
    answers,
    frames,
  };
}

const cinema = {
  id: 'u9',
  type: 'cinema',
  x: 4,
  level: 2,
  name: null,
  price: 'normal',
  occupied: false,
  variant: 'empty',
} as const;

describe('bindDemolishInput', () => {
  it('frames what is under the pointer', () => {
    const t = setup();
    t.hover({ x: 5, level: 2 });
    expect(t.frames.at(-1)).toMatchObject({ x: 5, level: 2, width: 1 });
    t.hover({ x: 5, level: 8 });
    expect(t.frames.at(-1)).toBeNull();
  });

  it('removes a floor run from press to release', () => {
    const t = setup();
    t.input('down', { x: 8, level: 2 });
    t.hover({ x: 3, level: 2 });
    t.input('up', { x: 3, level: 2 });
    expect(t.sent).toEqual([
      { type: 'demolish', target: { kind: 'floor', level: 2, x0: 3, x1: 8 } },
    ]);
  });

  it('sends nothing when Esc drops the drag', () => {
    const t = setup();
    t.input('down', { x: 8, level: 2 });
    t.escape();
    t.input('up', { x: 8, level: 2 });
    expect(t.sent).toEqual([]);
  });

  it('sends nothing when a right click drops the drag', () => {
    const t = setup();
    t.input('down', { x: 8, level: 2 });
    t.input('cancel', null);
    t.input('up', { x: 8, level: 2 });
    expect(t.sent).toEqual([]);
  });

  it('waits for the answer before demolishing a cinema', () => {
    const t = setup([cinema]);
    t.input('down', { x: 4, level: 2 });
    expect(t.asked).toHaveLength(1);
    expect(t.sent).toEqual([]);
    t.answers[0]?.();
    expect(t.sent).toEqual([{ type: 'demolish', target: { kind: 'unit', id: 'u9' } }]);
  });
});
