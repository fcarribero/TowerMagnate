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
  const outcomes: unknown[] = [];
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
      structure: new Map([
        [2, 'f'.repeat(40)],
        [3, '..rrr.rr..'],
      ]),
      units,
      transports: [],
      shafts: [],
      cars: [],
    }),
    confirm: (confirmation, proceed) => {
      asked.push(confirmation);
      answers.push(proceed);
    },
    onOutcome: (outcome) => void outcomes.push(outcome),
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
    outcomes,
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

  it('clears one ruined cell on a click', () => {
    const t = setup();
    t.hover({ x: 3, level: 3 });
    expect(t.frames.at(-1)).toMatchObject({ x: 3, level: 3, width: 1 });
    t.input('down', { x: 3, level: 3 });
    t.input('up', { x: 3, level: 3 });
    expect(t.sent).toEqual([{ type: 'demolish', target: { kind: 'ruins', level: 3, x: 3 } }]);
  });

  it('clears every ruined cell under a drag and skips the gaps', () => {
    const t = setup();
    t.input('down', { x: 7, level: 3 });
    t.hover({ x: 2, level: 3 });
    t.input('up', { x: 2, level: 3 });
    expect(t.sent.map((command) => command.type === 'demolish' && command.target)).toEqual([
      { kind: 'ruins', level: 3, x: 2 },
      { kind: 'ruins', level: 3, x: 3 },
      { kind: 'ruins', level: 3, x: 4 },
      { kind: 'ruins', level: 3, x: 6 },
      { kind: 'ruins', level: 3, x: 7 },
    ]);
  });

  it('reports a ruins run once, with the summed refund', async () => {
    const t = setup();
    t.input('down', { x: 7, level: 3 });
    t.hover({ x: 2, level: 3 });
    t.input('up', { x: 2, level: 3 });
    await Promise.resolve();
    await Promise.resolve();
    expect(t.outcomes).toEqual([{ ok: true, cost: 0, refund: 2500 }]);
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
