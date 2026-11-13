import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { BuildFeedback } from './placement/BuildFeedback';

afterEach(cleanup);

function rule(file: string, selector: string): string {
  const css = readFileSync(resolve(__dirname, file), 'utf8');
  const start = css.indexOf(`${selector} {`);
  return start < 0 ? '' : css.slice(start, css.indexOf('}', start) + 1);
}

describe('overlay legend look', () => {
  it('is a 96 wide window box with 12 tall rows', () => {
    const box = rule('overlay/overlay.css', '.overlay-legend');
    expect(box).toContain('width: calc(96 * var(--tm-px));');
    expect(box).toContain('background: var(--obra-paper);');
    expect(box).toContain('border: var(--border-window);');
    expect(box).toContain('box-shadow: var(--shadow-window);');
    expect(rule('overlay/overlay.css', '.overlay-legend__row')).toContain(
      'height: calc(12 * var(--tm-px));',
    );
    expect(rule('overlay/overlay.css', '.overlay-legend__swatch')).toContain(
      'width: calc(6 * var(--tm-px));',
    );
  });
});

describe('floating amounts', () => {
  it('use text.price with an ink outline and rise 16 UI px in 1 second', () => {
    const cost = rule('placement/buildFeedback.css', '.tm-float-cost');
    expect(cost).toContain('font: var(--text-price);');
    expect(cost).toContain('text-shadow: var(--tm-outline);');
    expect(cost).toContain('animation: tm-float-up 1s');
    expect(rule('income/incomeFloaters.css', '.tm-float-income')).toContain(
      'font: var(--text-price);',
    );
    const rise = /@keyframes tm-float-up \{[^]*?\n\}/.exec(
      readFileSync(resolve(__dirname, 'placement/buildFeedback.css'), 'utf8'),
    )?.[0];
    expect(rise).toContain('16 * var(--tm-px)');
  });
});

describe('ghost cost label', () => {
  const at = { x: 10, y: 20 };

  it('is a plain tag while the pre-check passes', () => {
    render(<BuildFeedback floats={[]} dragLabel={{ floors: 3, cost: 1000, valid: true, at }} />);
    expect(document.querySelector('.tm-drag-label')?.className).toBe('tm-drag-label');
  });

  it('turns red when the pre-check fails', () => {
    render(<BuildFeedback floats={[]} dragLabel={{ floors: 31, cost: 1000, valid: false, at }} />);
    expect(document.querySelector('.tm-drag-label')?.className).toBe('tm-drag-label is-failed');
    expect(rule('placement/buildFeedback.css', '.tm-drag-label.is-failed')).toContain(
      'color: var(--obra-red);',
    );
  });
});
