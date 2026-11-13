import { describe, expect, it } from 'vitest';
import { anchoredPosition, isInsidePanelArea } from './unitAnchor';

const view = { width: 800, height: 600 };
const panel = { width: 200, height: 300 };

describe('anchoredPosition', () => {
  it('sits at the top right corner of the unit', () => {
    const unit = { x: 100, y: 120, width: 60, height: 40 };
    expect(anchoredPosition(unit, panel, view, 8)).toEqual({ x: 168, y: 120 });
  });

  it('moves to the left of the unit when the right side has no room', () => {
    const unit = { x: 700, y: 120, width: 60, height: 40 };
    expect(anchoredPosition(unit, panel, view, 8)).toEqual({ x: 492, y: 120 });
  });

  it('stays inside the view at the bottom and when the unit is partly off screen', () => {
    const unit = { x: -30, y: 500, width: 60, height: 40 };
    expect(anchoredPosition(unit, panel, view, 8)).toEqual({ x: 38, y: 300 });
    const offLeft = { x: 750, y: -20, width: 100, height: 40 };
    expect(anchoredPosition(offLeft, panel, view, 8)).toEqual({ x: 542, y: 0 });
  });
});

describe('isInsidePanelArea', () => {
  it('is true for the canvas, the panel and dialogs, false for anything else', () => {
    document.body.innerHTML =
      '<canvas id="c"></canvas><div data-window-id="personPanel:p1"><b id="in"></b></div>' +
      '<div data-window-id="personPanel:p2"><b id="other"></b></div>' +
      '<div class="tm-window--dialog"><b id="dialog"></b></div><i id="out"></i>';
    const at = (id: string) => document.getElementById(id);
    expect(isInsidePanelArea(at('c'), 'personPanel:p1')).toBe(true);
    expect(isInsidePanelArea(at('in'), 'personPanel:p1')).toBe(true);
    expect(isInsidePanelArea(at('dialog'), 'personPanel:p1')).toBe(true);
    expect(isInsidePanelArea(at('other'), 'personPanel:p1')).toBe(false);
    expect(isInsidePanelArea(at('out'), 'personPanel:p1')).toBe(false);
    expect(isInsidePanelArea(null, 'personPanel:p1')).toBe(false);
  });
});
