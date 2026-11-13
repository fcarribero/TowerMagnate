import type { Command } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import type { Cell } from '../../render/cellAtPoint';
import type { CellInput } from '../../render/stage';
import type { ToolId } from '../toolbar/toolbarModel';
import type { PlacementWorld } from '../../render/placementCheck';
import { bindBuildInput } from './bindBuildInput';
import { adjacentSlots, type GrabbedShaft } from './buildPlan';

function setup(
  tool: ToolId,
  lobbyHeight = 1,
  extra: {
    shaftAt?: (cell: Cell) => GrabbedShaft | null;
    lobbyHeightAt?: (level: number) => number | null;
    onCancelTool?: () => void;
    worldAt?: () => PlacementWorld | null;
    refuse?: (command: Command) => boolean;
  } = {},
) {
  let onInput: (input: CellInput) => void = () => {};
  let onHover: (cell: Cell | null) => void = () => {};
  const runs: unknown[] = [];
  const sent: Command[] = [];
  const batches: (string | undefined)[] = [];
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
      send: (command, options) => {
        sent.push(command);
        batches.push(options?.batch);
        return Promise.resolve(
          extra.refuse?.(command)
            ? { ok: false as const, error: 'INSUFFICIENT_FUNDS' }
            : { ok: true as const, cost: 10, refund: 0 },
        );
      },
    },
    tool,
    lobbyHeight,
    pause: () => Promise.resolve(),
    shaftAt: extra.shaftAt,
    lobbyHeightAt: extra.lobbyHeightAt,
    onCancelTool: extra.onCancelTool,
    worldAt: extra.worldAt,
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
    batches,
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

  it('drops the tool with a right click, in a drag or not', () => {
    let cancelled = 0;
    const t = setup('floor', 1, { onCancelTool: () => (cancelled += 1) });
    t.input('cancel', null);
    t.input('down', { x: 2, level: 3 });
    t.input('cancel', null);
    t.input('up', { x: 6, level: 3 });
    expect(cancelled).toBe(2);
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

  describe('hand tool', () => {
    const shaft = (end: 'top' | 'bottom'): GrabbedShaft => ({
      id: 's4',
      type: 'standard',
      x: 30,
      bottom: 1,
      top: 10,
      end,
    });

    it('stretches the top of a shaft to the level where the hand lets go', () => {
      const t = setup('hand', 1, { shaftAt: () => shaft('top') });
      t.input('down', { x: 30, level: 10 });
      t.input('up', { x: 30, level: 14 });
      expect(t.sent).toEqual([{ type: 'resizeShaft', shaftId: 's4', bottom: 1, top: 14 }]);
    });

    it('moves the bottom of a shaft when that end was grabbed', () => {
      const t = setup('hand', 1, { shaftAt: () => shaft('bottom') });
      t.input('down', { x: 30, level: 1 });
      t.input('up', { x: 30, level: 3 });
      expect(t.sent).toEqual([{ type: 'resizeShaft', shaftId: 's4', bottom: 3, top: 10 }]);
    });

    it('shows the new shaft while dragging, and sends nothing on Esc', () => {
      const t = setup('hand', 1, { shaftAt: () => shaft('top') });
      t.input('down', { x: 30, level: 10 });
      t.hover({ x: 30, level: 12 });
      expect(t.runs.at(-1)).toMatchObject({ x: 30, level: 1, floors: 12, valid: true });
      t.pressEscape();
      t.input('up', { x: 30, level: 12 });
      expect(t.sent).toEqual([]);
    });

    it('sends nothing when the shaft keeps its levels or the end crosses the other one', () => {
      const same = setup('hand', 1, { shaftAt: () => shaft('top') });
      same.input('down', { x: 30, level: 10 });
      same.input('up', { x: 30, level: 10 });
      expect(same.sent).toEqual([]);
      const crossed = setup('hand', 1, { shaftAt: () => shaft('top') });
      crossed.input('down', { x: 30, level: 10 });
      crossed.input('up', { x: 30, level: -2 });
      expect(crossed.sent).toEqual([]);
    });

    it('sends nothing for a press outside a shaft', () => {
      const t = setup('hand', 1, { shaftAt: () => null });
      t.input('down', { x: 31, level: 7 });
      t.input('up', { x: 31, level: 9 });
      expect(t.sent).toEqual([]);
    });
  });

  it('builds a lobby at the height already fixed on that level', () => {
    const t = setup('lobby', 1, { lobbyHeightAt: (level) => (level === 1 ? 3 : null) });
    t.input('down', { x: 2, level: 1 });
    t.input('up', { x: 4, level: 1 });
    expect(t.sent).toEqual([{ type: 'buildLobby', level: 1, x0: 2, x1: 4, height: 3 }]);
  });

  describe('holding a unit tool', () => {
    const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
    const office = (x: number) => ({ type: 'buildUnit', unitType: 'office', x, level: 4 });

    it('builds adjacent units to the right in order, in one batch', async () => {
      const t = setup('office');
      t.input('down', { x: 10, level: 4 });
      t.hover({ x: 30, level: 4 });
      await flush();
      t.input('up', { x: 30, level: 4 });
      await flush();
      expect(t.sent).toEqual([office(10), office(19), office(28)]);
      expect(new Set(t.batches).size).toBe(1);
      expect(t.batches[0]).toBeDefined();
    });

    it('builds to the left and does not rebuild when dragged back', async () => {
      const t = setup('office');
      t.input('down', { x: 30, level: 4 });
      t.hover({ x: 25, level: 4 });
      await flush();
      t.hover({ x: 35, level: 4 });
      t.hover({ x: 30, level: 4 });
      await flush();
      t.input('up', { x: 30, level: 4 });
      expect(t.sent).toEqual([office(30), office(21)]);
    });

    it('builds every slot between when the pointer jumps', async () => {
      const t = setup('office');
      t.input('down', { x: 0, level: 4 });
      t.input('up', { x: 30, level: 4 });
      await flush();
      expect(t.sent.map((c) => (c as { x: number }).x)).toEqual([0, 9, 18, 27]);
    });

    it('builds one unit for a click', async () => {
      const t = setup('office');
      t.input('down', { x: 10, level: 4 });
      t.hover({ x: 12, level: 4 });
      t.input('up', { x: 12, level: 4 });
      await flush();
      expect(t.sent).toEqual([office(10)]);
    });

    it('ignores other levels', async () => {
      const t = setup('office');
      t.input('down', { x: 10, level: 4 });
      t.hover({ x: 40, level: 5 });
      await flush();
      expect(t.sent).toEqual([office(10)]);
    });

    it('stops after a refusal until release', async () => {
      const t = setup('office', 1, { refuse: (c) => (c as { x: number }).x === 19 });
      t.input('down', { x: 10, level: 4 });
      t.hover({ x: 50, level: 4 });
      await flush();
      t.hover({ x: 60, level: 4 });
      await flush();
      expect(t.sent).toEqual([office(10), office(19)]);
    });

    it('stops at the first slot the client check shows red', async () => {
      const world = {
        structure: new Map(),
        units: [],
        transports: [],
        money: 1_000_000_000,
      } as unknown as PlacementWorld;
      const t = setup('office', 1, { worldAt: () => world });
      // No floor anywhere: the press goes out as a click, the next slot is red.
      t.input('down', { x: 10, level: 4 });
      t.hover({ x: 40, level: 4 });
      await flush();
      expect(t.sent).toEqual([office(10)]);
    });

    it('keeps built units on cancel and builds no more', async () => {
      const t = setup('office');
      t.input('down', { x: 10, level: 4 });
      t.hover({ x: 20, level: 4 });
      await flush();
      t.pressEscape();
      t.hover({ x: 50, level: 4 });
      await flush();
      expect(t.sent).toEqual([office(10), office(19)]);
    });

    it('drops the tool and stops on a right click', async () => {
      let cancelled = 0;
      const t = setup('office', 1, { onCancelTool: () => (cancelled += 1) });
      t.input('down', { x: 10, level: 4 });
      t.input('cancel', null);
      t.hover({ x: 50, level: 4 });
      await flush();
      expect(t.sent).toEqual([office(10)]);
      expect(cancelled).toBe(1);
    });

    it('does not repeat stairs', async () => {
      const t = setup('stairs');
      t.input('down', { x: 10, level: 4 });
      t.hover({ x: 40, level: 4 });
      await flush();
      expect(t.sent).toHaveLength(1);
    });
  });
});

describe('adjacentSlots', () => {
  it('gives the next columns to the right and to the left of the built ones', () => {
    expect(adjacentSlots(10, 30, 9, { min: 0, max: 0 })).toEqual([19, 28]);
    expect(adjacentSlots(10, 5, 9, { min: 0, max: 0 })).toEqual([1]);
    expect(adjacentSlots(10, 5, 9, { min: -1, max: 2 })).toEqual([]);
    expect(adjacentSlots(10, 18, 9, { min: 0, max: 0 })).toEqual([]);
  });
});
