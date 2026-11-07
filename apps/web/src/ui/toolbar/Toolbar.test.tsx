import type { StarRating } from '@tower-magnate/shared';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOOLTIP_DELAY_MS } from '../kit';
import { Toolbar } from './Toolbar';
import type { ToolId } from './toolbarModel';

afterEach(cleanup);

function Harness({ stars, initialTool = 'inspect' }: { stars: StarRating; initialTool?: ToolId }) {
  const [tool, setTool] = useState<ToolId>(initialTool);
  return <Toolbar stars={stars} currentTool={tool} onSelectTool={setTool} />;
}

function toolButton(name: string): HTMLElement {
  return screen.getByRole('button', { name });
}

function openCategory(name: string): void {
  fireEvent.click(screen.getByRole('tab', { name }));
}

function infoText(): string {
  return document.querySelector('.tm-toolbar__info')?.textContent ?? '';
}

describe('Toolbar', () => {
  it('starts with the Lupa pressed and Estructura open', () => {
    render(<Harness stars={1} />);
    expect(toolButton('Lupa').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Estructura' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    const panel = screen.getByRole('tabpanel');
    expect(
      within(panel)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Piso', 'Lobby']);
  });

  it('opens a category without changing the current tool', () => {
    render(<Harness stars={1} />);
    openCategory('Hotel');
    const panel = screen.getByRole('tabpanel', { name: 'Hotel' });
    expect(within(panel).getAllByRole('button')).toHaveLength(4);
    expect(toolButton('Lupa').getAttribute('aria-pressed')).toBe('true');
  });

  it('selects an unlocked tool and shows it in the info box', () => {
    render(<Harness stars={1} />);
    openCategory('Oficinas y vivienda');
    fireEvent.click(toolButton('Oficina'));
    expect(toolButton('Oficina').getAttribute('aria-pressed')).toBe('true');
    expect(toolButton('Lupa').getAttribute('aria-pressed')).toBe('false');
    expect(infoText()).toBe('Oficina9 x 1 casilleros$40.000');
  });

  it('keeps locked tools unselectable at 1 star', () => {
    render(<Harness stars={1} />);
    openCategory('Hotel');
    const suite = toolButton('Suite');
    expect(suite.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(suite);
    expect(suite.getAttribute('aria-pressed')).toBe('false');
    expect(toolButton('Lupa').getAttribute('aria-pressed')).toBe('true');
  });

  it('unlocks tools when the rating rises', () => {
    const { rerender } = render(<Harness stars={1} />);
    openCategory('Hotel');
    expect(toolButton('Suite').getAttribute('aria-disabled')).toBe('true');
    rerender(<Harness stars={2} />);
    expect(toolButton('Suite').getAttribute('aria-disabled')).toBe('false');
  });

  it('shows a hovered tool in the info box until the pointer leaves', () => {
    render(<Harness stars={1} />);
    openCategory('Servicios');
    fireEvent.pointerEnter(toolButton('Catedral'));
    expect(infoText()).toBe('Catedral28 x 4 casilleros$3.000.000Se desbloquea con 5 estrellas');
    fireEvent.pointerLeave(toolButton('Catedral'));
    expect(infoText()).toBe('Lupa');
  });

  it('switches fixed tools with L, T and C', () => {
    render(<Harness stars={1} />);
    fireEvent.keyDown(window, { key: 't' });
    expect(toolButton('Topadora').getAttribute('aria-pressed')).toBe('true');
    fireEvent.keyDown(window, { key: 'C' });
    expect(toolButton('Cabina').getAttribute('aria-pressed')).toBe('true');
    fireEvent.keyDown(window, { key: 'l' });
    expect(toolButton('Lupa').getAttribute('aria-pressed')).toBe('true');
  });

  it('ignores shortcuts with modifiers', () => {
    render(<Harness stars={1} />);
    fireEvent.keyDown(window, { key: 't', ctrlKey: true });
    expect(toolButton('Lupa').getAttribute('aria-pressed')).toBe('true');
  });

  it('opens the category of the current building tool', () => {
    render(<Harness stars={3} initialTool="cinema" />);
    expect(
      screen.getByRole('tab', { name: 'Comercio y entretenimiento' }).getAttribute('aria-selected'),
    ).toBe('true');
  });

  describe('tooltips', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('list name and price, size, and the stars a locked tool needs', () => {
      render(<Harness stars={1} />);
      openCategory('Transporte');
      const anchor = toolButton('Ascensor expreso').closest('.tm-tooltip-anchor') as HTMLElement;
      fireEvent.pointerEnter(anchor);
      act(() => {
        vi.advanceTimersByTime(TOOLTIP_DELAY_MS);
      });
      const lines = [...screen.getByRole('tooltip').querySelectorAll('.tm-tooltip__line')];
      expect(lines.map((line) => line.textContent)).toEqual([
        'Ascensor expreso: $400.000 + $150.000 por cabina',
        'Hueco de 6',
        'Se desbloquea con 3 estrellas',
      ]);
    });
  });
});
