import { cleanup, render, screen, waitFor } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'preact/hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CommandOutcome } from '../../api/commandApi';
import { useFakeLayoutSizes } from '../../testing/fakeLayout';
import { WindowLayer, useWindowManager } from '../kit';
import { ElevatorWindow, type ShaftData } from './ElevatorWindow';

useFakeLayoutSizes({ clientWidth: 800, clientHeight: 600, offsetWidth: 200, offsetHeight: 100 });
afterEach(cleanup);

const band = { mode: 'normal', dwellSeconds: 5, responseDistance: 5 } as const;
const schedule = {
  weekday: Array.from({ length: 6 }, () => band),
  weekend: Array.from({ length: 6 }, () => band),
} as unknown as ShaftData['schedule'];

const shaft = (patch: Partial<ShaftData> = {}): ShaftData => ({
  kind: 'shaft',
  id: 's4',
  type: 'standard',
  bottom: 1,
  top: 3,
  stops: [1, 2, 3],
  cars: [{ index: 0, homeLevel: 1, load: 4 }],
  schedule,
  ...patch,
});

type Props = Parameters<typeof ElevatorWindow>[0];

function Open(props: Props) {
  const manager = useWindowManager();
  useEffect(() => {
    manager.open({ id: `elevator-${props.shaft.id}`, position: { x: 10, y: 10 } });
  }, []);
  return <ElevatorWindow {...props} />;
}

function show(
  data: ShaftData,
  send: Props['send'] = vi.fn(async (): Promise<CommandOutcome> => ({ ok: true, cost: 0 })),
) {
  render(
    <WindowLayer>
      <Open shaft={data} send={send} onClose={() => undefined} />
    </WindowLayer>,
  );
  return send;
}

describe('ElevatorWindow', () => {
  it('lists only express levels on an express shaft', () => {
    show(shaft({ type: 'express', bottom: -1, top: 16, stops: [-1, 1, 15] }));
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
  });

  it('applies toggled stops with configureShaft', async () => {
    const send = show(shaft());
    await userEvent.click(screen.getByLabelText('Para en 2'));
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'configureShaft', stops: [1, 3], carHomes: [1] }),
    );
  });

  it('disables Aplicar until something changes', () => {
    show(shaft());
    expect((screen.getByRole('button', { name: 'Aplicar' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('adds a car at once and disables Quitar on the last car', async () => {
    const send = show(shaft());
    await userEvent.click(screen.getByRole('tab', { name: 'Cabinas' }));
    expect((screen.getByRole('button', { name: 'Quitar' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Agregar cabina' }));
    expect(send).toHaveBeenCalledWith({ type: 'addCar', shaftId: 's4', homeLevel: 1 });
  });

  it('disables adding at 8 cars', async () => {
    const cars = Array.from({ length: 8 }, (_, index) => ({ index, homeLevel: 1, load: 0 }));
    show(shaft({ cars }));
    await userEvent.click(screen.getByRole('tab', { name: 'Cabinas' }));
    expect(
      (screen.getByRole('button', { name: 'Agregar cabina' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('shows the Spanish text of an engine error', async () => {
    show(
      shaft(),
      vi.fn(async (): Promise<CommandOutcome> => ({ ok: false, error: 'SHAFT_IN_USE' })),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar recorrido' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('Hay gente viajando en el ascensor.'),
    );
  });
});
