import { describe, expect, it } from 'vitest';
import { clearStructure } from '../grid';
import { accept, fullSiteTower } from './shaft-test-helpers';

/** A shaft on levels 90 to 99 under a tower whose levels 100 and 101 have no structure. */
function tower() {
  const state = fullSiteTower([{ type: 'standard', x: 40, bottom: 90, top: 99 }]);
  clearStructure(state.grid, 100, 0, 374);
  clearStructure(state.grid, 101, 0, 374);
  return state;
}

const grow = { type: 'resizeShaft', shaftId: 's1', bottom: 90, top: 101 } as const;

describe('shaft stops and structure behind the shaft', () => {
  it('leaves levels with no structure behind them out of the stops when the shaft grows', () => {
    const { state } = accept(tower(), grow);
    expect(state.shafts.s1?.stops).toContain(99);
    expect(state.shafts.s1?.stops).not.toContain(100);
    expect(state.shafts.s1?.stops).not.toContain(101);
  });

  it('enables the stop on a level once structure is built behind the shaft', () => {
    const grown = accept(tower(), grow);
    const { state } = accept(grown.state, { type: 'buildFloor', level: 100, x0: 36, x1: 50 });
    expect(state.shafts.s1?.stops).toContain(100);
    expect(state.shafts.s1?.stops).not.toContain(101);
  });

  it('keeps a stop the player turned off on a level that is already built', () => {
    const grown = accept(tower(), grow);
    const shaft = grown.state.shafts.s1;
    if (!shaft) throw new Error('Expected a shaft');
    shaft.stops = shaft.stops.filter((level) => level !== 95);
    const { state } = accept(grown.state, { type: 'buildFloor', level: 100, x0: 36, x1: 50 });
    expect(state.shafts.s1?.stops).not.toContain(95);
    expect(state.shafts.s1?.stops).toContain(100);
  });
});
