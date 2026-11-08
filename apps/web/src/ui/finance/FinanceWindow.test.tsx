import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClientStore } from '../../model/clientStore';
import { snapshot } from '../../testing/protocolFixtures';
import { useFakeLayoutSizes } from '../../testing/fakeLayout';
import { WindowLayer } from '../kit/WindowLayer';
import { FinanceWindow } from './FinanceWindow';

useFakeLayoutSizes({ clientWidth: 800, clientHeight: 600, offsetWidth: 260, offsetHeight: 200 });

afterEach(cleanup);

function renderWindow(finances: typeof snapshot.finances, money = 1_234_567) {
  const store = new ClientStore({ requestResync: () => undefined, now: () => 0 });
  store.applySnapshot({ ...snapshot, money, finances });
  const onClose = vi.fn();
  render(
    <WindowLayer>
      <FinanceWindow store={store} onClose={onClose} />
    </WindowLayer>,
  );
  return onClose;
}

function row(label: string): HTMLElement {
  return screen.getByText(label).closest('tr') as HTMLElement;
}

describe('FinanceWindow', () => {
  it('shows the balance and the week header', () => {
    renderWindow({ thisWeek: { weekStartStep: 0, income: {}, expenses: {} }, lastWeek: null });
    expect(screen.getByText('$1.234.567')).toBeTruthy();
    expect(screen.getByText('Semana del lunes 1 de enero')).toBeTruthy();
  });

  it('shows a mixed category net and splits it in the totals', () => {
    renderWindow({
      thisWeek: {
        weekStartStep: 0,
        income: { refund: 10_000 },
        expenses: { construction: -4_000 },
      },
      lastWeek: null,
    });
    expect(row('Construcción').textContent).toContain('$6.000');
    expect(row('Total ingresos').textContent).toContain('$10.000');
    expect(row('Total gastos').textContent).toContain('-$4.000');
    expect(row('Resultado').textContent).toContain('$6.000');
  });

  it('draws negatives in red and fills the previous week column', () => {
    renderWindow({
      thisWeek: { weekStartStep: 60_480, income: {}, expenses: { upkeep: -30_000 } },
      lastWeek: { weekStartStep: 0, income: { rent: 35_000 }, expenses: {} },
    });
    const upkeep = row('Mantenimiento').querySelectorAll('td');
    expect(upkeep[0]?.classList.contains('is-negative')).toBe(true);
    expect(row('Alquileres').querySelectorAll('td')[1]?.textContent).toBe('$35.000');
  });

  it('closes from the close button', () => {
    const onClose = renderWindow({
      thisWeek: { weekStartStep: 0, income: {}, expenses: {} },
      lastWeek: null,
    });
    act(() => {
      fireEvent.click(screen.getByLabelText('Cerrar'));
    });
    expect(onClose).toHaveBeenCalled();
  });
});
