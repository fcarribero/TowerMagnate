import type { StarRating } from '@tower-magnate/shared';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOOLTIP_DELAY_MS } from '../kit';
import { Toolbar } from './Toolbar';
import type { ToolId } from './toolbarModel';

afterEach(cleanup);

interface HarnessProps {
  stars: StarRating;
  initialTool?: ToolId;
  lockedLobbyHeight?: number;
  showMainLobbyWarning?: boolean;
  disabled?: boolean;
}

function Harness({ stars, initialTool = 'inspect', ...lobbyContext }: HarnessProps) {
  const [tool, setTool] = useState<ToolId>(initialTool);
  const [lobbyHeight, setLobbyHeight] = useState(1);
  return (
    <Toolbar
      stars={stars}
      currentTool={tool}
      onSelectTool={setTool}
      lobbyHeight={lobbyHeight}
      onLobbyHeightChange={setLobbyHeight}
      {...lobbyContext}
    />
  );
}

function lobbyHeightRadio(height: number): HTMLInputElement {
  return screen.getByRole('radio', { name: String(height) }) as HTMLInputElement;
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

  it('shows short labels on buttons and keeps full names for screen readers', () => {
    render(<Harness stars={2} />);
    const category = screen.getByRole('tab', { name: 'Comercio y entretenimiento' });
    expect(category.textContent).toBe('Com. y entr.');
    openCategory('Hotel');
    expect(toolButton('Habitación simple').textContent).toBe('Hab. simple');
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
    expect(infoText()).toBe('Catedral28 x 4 casilleros$35.000.000');
    expect(document.querySelector('.tm-toolbar__info-size')?.textContent).toBe('28 x 4 casilleros');
    expect(document.querySelector('.tm-toolbar__info-price')?.textContent).toBe('$35.000.000');
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

  it('returns to the Lupa on Esc', () => {
    vi.useFakeTimers();
    render(<Harness stars={1} initialTool="office" />);
    fireEvent.keyDown(window, { key: 'Escape' });
    act(() => {
      vi.runAllTimers();
    });
    vi.useRealTimers();
    expect(toolButton('Lupa').getAttribute('aria-pressed')).toBe('true');
    expect(toolButton('Oficina').getAttribute('aria-pressed')).toBe('false');
  });

  it('leaves the tool alone when something else already handled Esc', () => {
    render(<Harness stars={1} initialTool="office" />);
    const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    event.preventDefault();
    vi.useFakeTimers();
    window.dispatchEvent(event);
    act(() => {
      vi.runAllTimers();
    });
    vi.useRealTimers();
    expect(toolButton('Oficina').getAttribute('aria-pressed')).toBe('true');
  });

  it('leaves the tool alone when a handler marks Esc as handled after the toolbar', () => {
    vi.useFakeTimers();
    render(<Harness stars={1} initialTool="office" />);
    window.addEventListener('keydown', (event) => event.preventDefault(), { once: true });
    fireEvent.keyDown(window, { key: 'Escape', cancelable: true });
    act(() => {
      vi.runAllTimers();
    });
    vi.useRealTimers();
    expect(toolButton('Oficina').getAttribute('aria-pressed')).toBe('true');
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

  describe('lobby height', () => {
    it('shows the height choice only while the lobby is the current tool', () => {
      render(<Harness stars={1} />);
      expect(screen.queryByRole('radio')).toBeNull();
      fireEvent.click(toolButton('Lobby'));
      expect(screen.getByRole('group', { name: 'Alto:' })).toBeTruthy();
      expect(lobbyHeightRadio(1).checked).toBe(true);
      fireEvent.click(toolButton('Lupa'));
      expect(screen.queryByRole('radio')).toBeNull();
    });

    it('changes the chosen height', () => {
      render(<Harness stars={1} initialTool="lobby" />);
      fireEvent.click(lobbyHeightRadio(3));
      expect(lobbyHeightRadio(3).checked).toBe(true);
      expect(lobbyHeightRadio(1).checked).toBe(false);
    });

    it('hides the choice while another tool is hovered', () => {
      render(<Harness stars={1} initialTool="lobby" />);
      fireEvent.pointerEnter(toolButton('Piso'));
      expect(screen.queryByRole('radio')).toBeNull();
      fireEvent.pointerLeave(toolButton('Piso'));
      expect(lobbyHeightRadio(1)).toBeTruthy();
    });

    it('locks the choice to the height of the lobby on the hovered level', () => {
      render(<Harness stars={1} initialTool="lobby" lockedLobbyHeight={2} />);
      expect(lobbyHeightRadio(2).checked).toBe(true);
      expect(lobbyHeightRadio(1).matches(':disabled')).toBe(true);
      expect(infoText()).toContain('Alto fijado por el lobby existente');
    });

    it('warns that the main lobby height is final', () => {
      render(<Harness stars={1} initialTool="lobby" showMainLobbyWarning />);
      expect(infoText()).toContain('La altura del lobby principal no se puede cambiar después.');
    });
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
        'Ascensor expreso: $600.000 + $250.000 por cabina',
        'Hueco de 6',
        'Se desbloquea con 3 estrellas',
      ]);
    });
  });

  describe('while disabled', () => {
    it('ignores clicks and shortcut keys', () => {
      render(<Harness stars={1} disabled />);
      fireEvent.click(toolButton('Topadora'));
      fireEvent.keyDown(window, { key: 'c' });
      expect(toolButton('Lupa').getAttribute('aria-pressed')).toBe('true');
      expect(toolButton('Topadora').getAttribute('aria-disabled')).toBe('true');
    });
  });
});
