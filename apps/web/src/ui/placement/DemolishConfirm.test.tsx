import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useFakeLayoutSizes } from '../../testing/fakeLayout';
import { WindowLayer } from '../kit';
import { DemolishConfirm } from './DemolishConfirm';
import type { Confirmation } from './demolishPlan';

useFakeLayoutSizes({ clientWidth: 800, clientHeight: 600, offsetWidth: 260, offsetHeight: 140 });

afterEach(cleanup);

const soldCondo: Confirmation = { kind: 'soldCondo', unitType: 'condo', price: 80_000 };
const expensive: Confirmation = { kind: 'expensive', unitType: 'cinema', price: 500_000 };

function renderConfirm(confirmation: Confirmation) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <WindowLayer>
      <DemolishConfirm confirmation={confirmation} onConfirm={onConfirm} onCancel={onCancel} />
    </WindowLayer>,
  );
  return { onConfirm, onCancel };
}

function frameOf(title: string): HTMLElement {
  const text = screen.getByText(title, { selector: '.tm-window__title-text' });
  return text.closest('section') as HTMLElement;
}

describe.each([
  ['demolishSoldCondo', soldCondo, 'Demoler departamento'],
  ['demolishExpensive', expensive, 'Demoler cine'],
])('%s dialog', (_id, confirmation, title) => {
  it('has a red title, a hazard stripe and a red Demoler next to a focused Cancelar', () => {
    renderConfirm(confirmation);

    const frame = frameOf(title);
    expect(frame.classList.contains('tm-window--dialog')).toBe(true);
    expect(frame.classList.contains('tm-window--dialog-info')).toBe(false);
    expect(frame.querySelector('.tm-window__stripe')).not.toBeNull();
    const buttons = Array.from(frame.querySelectorAll('.tm-dialog__buttons button'));
    expect(buttons.map((button) => button.textContent)).toEqual(['Demoler', 'Cancelar']);
    expect(buttons[0]?.classList.contains('is-default')).toBe(true);
    expect(buttons[1]?.classList.contains('is-default')).toBe(false);
    expect(document.activeElement).toBe(buttons[1]);
  });

  it('dims the tower, ignores the scrim and cancels on Esc', () => {
    const { onConfirm, onCancel } = renderConfirm(confirmation);

    fireEvent.click(document.querySelector('.tm-modal-backdrop') as HTMLElement);
    expect(onCancel).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('confirms with the action button', () => {
    const { onConfirm } = renderConfirm(confirmation);

    fireEvent.click(screen.getByRole('button', { name: 'Demoler' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe('demolish dialog texts', () => {
  it('names the refund for a sold condo', () => {
    renderConfirm(soldCondo);
    expect(screen.getByText(/le devolvés \$80\.000 a los dueños/)).toBeTruthy();
  });

  it('names the price of an expensive unit', () => {
    renderConfirm(expensive);
    expect(screen.getByText(/Costó \$500\.000/)).toBeTruthy();
  });
});
