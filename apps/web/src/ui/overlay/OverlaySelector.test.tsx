import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OverlayLegend } from './OverlayLegend';
import { OverlaySelector } from './OverlaySelector';

afterEach(cleanup);

describe('OverlaySelector', () => {
  it('has 4 buttons with exactly one on', () => {
    render(<OverlaySelector overlay="price" onSelect={() => undefined} />);
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Normal',
      'Evaluación',
      'Precios',
      'Hotel',
    ]);
    expect(document.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1);
    expect(screen.getByText('Precios').getAttribute('aria-pressed')).toBe('true');
  });

  it('reports the clicked overlay', () => {
    const onSelect = vi.fn();
    render(<OverlaySelector overlay="normal" onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Hotel'));
    expect(onSelect).toHaveBeenCalledWith('hotel');
  });
});

describe('OverlayLegend', () => {
  it('is hidden in Normal', () => {
    render(<OverlayLegend overlay="normal" />);
    expect(document.querySelector('.overlay-legend')).toBeNull();
  });

  it('shows the overlay name and its 4 labels', () => {
    render(<OverlayLegend overlay="evaluation" />);
    expect(document.querySelector('.overlay-legend__title')?.textContent).toBe('Evaluación');
    expect(
      [...document.querySelectorAll('.overlay-legend__row')].map((r) => r.textContent),
    ).toEqual(['Buena', 'Regular', 'Mala', 'Sin evaluar']);
  });
});
