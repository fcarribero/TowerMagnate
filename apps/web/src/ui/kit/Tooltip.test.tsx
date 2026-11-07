import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from './Button';
import { TOOLTIP_DELAY_MS, Tooltip, placeBelow } from './Tooltip';

afterEach(cleanup);

function renderTooltip(text: string | string[] = 'Lupa') {
  render(
    <Tooltip text={text}>
      <Button>L</Button>
    </Tooltip>,
  );
  const button = screen.getByRole('button', { name: 'L' });
  return {
    button,
    // Enter and leave do not bubble, so they are fired where the browser would: on the wrapper.
    anchor: button.closest('.tm-tooltip-anchor') as HTMLElement,
    tooltip: () => screen.queryByRole('tooltip'),
  };
}

describe('Tooltip', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('appears after the pointer rests for half a second', () => {
    const { anchor, tooltip } = renderTooltip();
    fireEvent.pointerEnter(anchor);
    act(() => {
      vi.advanceTimersByTime(TOOLTIP_DELAY_MS - 1);
    });
    expect(tooltip()).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(tooltip()?.textContent).toBe('Lupa');
  });

  it('never appears when the pointer leaves before the delay', () => {
    const { anchor, tooltip } = renderTooltip();
    fireEvent.pointerEnter(anchor);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    fireEvent.pointerLeave(anchor);
    act(() => {
      vi.advanceTimersByTime(TOOLTIP_DELAY_MS);
    });
    expect(tooltip()).toBeNull();
  });

  it('hides on leave, on press and on Esc', () => {
    const { anchor, button, tooltip } = renderTooltip();
    const showNow = () => {
      fireEvent.pointerEnter(anchor);
      act(() => {
        vi.advanceTimersByTime(TOOLTIP_DELAY_MS);
      });
      expect(tooltip()).not.toBeNull();
    };
    showNow();
    fireEvent.pointerLeave(anchor);
    expect(tooltip()).toBeNull();
    showNow();
    fireEvent.pointerDown(button);
    expect(tooltip()).toBeNull();
    showNow();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(tooltip()).toBeNull();
  });

  it('draws one line per entry and describes its element', () => {
    const { anchor, button } = renderTooltip(['Oficina $40.000', '9 x 1 casilleros']);
    fireEvent.pointerEnter(anchor);
    act(() => {
      vi.advanceTimersByTime(TOOLTIP_DELAY_MS);
    });
    const tooltip = screen.getByRole('tooltip');
    const lines = Array.from(tooltip.querySelectorAll('.tm-tooltip__line'));
    expect(lines.map((line) => line.textContent)).toEqual(['Oficina $40.000', '9 x 1 casilleros']);
    expect(button.getAttribute('aria-describedby')).toBe(tooltip.id);
  });
});

describe('Tooltip with the keyboard', () => {
  it('appears at once when its element gets keyboard focus, and hides on blur', async () => {
    const user = userEvent.setup();
    const { tooltip } = renderTooltip();
    await user.tab();
    expect(tooltip()?.textContent).toBe('Lupa');
    await user.tab();
    expect(tooltip()).toBeNull();
  });
});

describe('placeBelow', () => {
  function tipOfSize(width: number, height: number): HTMLElement {
    const tip = document.createElement('span');
    Object.defineProperty(tip, 'offsetWidth', { value: width });
    Object.defineProperty(tip, 'offsetHeight', { value: height });
    return tip;
  }

  beforeEach(() => Object.assign(window, { innerWidth: 1024, innerHeight: 640 }));

  it('goes under the anchor, left aligned, with a gap of 4 UI pixels', () => {
    const anchor = new DOMRect(100, 50, 24, 24);
    expect(placeBelow(anchor, tipOfSize(80, 12), 2)).toEqual({ left: 100, top: 82 });
  });

  it('flips above near the bottom and stays inside on the right', () => {
    const anchor = new DOMRect(1000, 620, 24, 16);
    expect(placeBelow(anchor, tipOfSize(80, 12), 1)).toEqual({ left: 944, top: 604 });
  });
});
