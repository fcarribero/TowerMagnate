import { cleanup, render, screen, waitFor } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useEffect } from 'preact/hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CommandOutcome } from '../../api/commandApi';
import { useFakeLayoutSizes } from '../../testing/fakeLayout';
import { WindowLayer, useWindowManager } from '../kit';
import { elevatorWindowId } from '../inspectTarget';
import { ElevatorWindow, type ShaftData } from './ElevatorWindow';

useFakeLayoutSizes({ clientWidth: 800, clientHeight: 600, offsetWidth: 200, offsetHeight: 100 });
afterEach(cleanup);

const band = { mode: 'normal', dwellSeconds: 30, responseDistance: 5 } as const;
const schedule = {
  weekday: Array.from({ length: 6 }, () => band),
  weekend: Array.from({ length: 6 }, () => band),
} as unknown as ShaftData['schedule'];

const shaft = (patch: Partial<ShaftData> = {}): ShaftData => ({
  kind: 'shaft',
  id: 's4',
  status: 'ok',
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
    manager.open({ id: elevatorWindowId(props.shaft.id), position: { x: 10, y: 10 } });
  }, []);
  return <ElevatorWindow {...props} />;
}

function show(
  data: ShaftData,
  send: Props['send'] = vi.fn(async (): Promise<CommandOutcome> => ({
    ok: true,
    cost: 0,
    refund: 0,
  })),
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
    await userEvent.click(screen.getByRole('button', { name: 'Agregar cabina ($80.000)' }));
    expect(send).toHaveBeenCalledWith({ type: 'addCar', shaftId: 's4', homeLevel: 1 });
  });

  it('disables adding at 8 cars', async () => {
    const cars = Array.from({ length: 8 }, (_, index) => ({ index, homeLevel: 1, load: 0 }));
    show(shaft({ cars }));
    await userEvent.click(screen.getByRole('tab', { name: 'Cabinas' }));
    expect(
      (screen.getByRole('button', { name: 'Agregar cabina ($80.000)' }) as HTMLButtonElement)
        .disabled,
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

  describe('Horarios', () => {
    const openSchedule = async () => {
      await userEvent.click(screen.getByRole('tab', { name: 'Horarios' }));
    };
    const field = (name: string) => screen.getByLabelText(name) as HTMLInputElement;
    const applyButton = () => screen.getByRole('button', { name: 'Aplicar' }) as HTMLButtonElement;

    it('shows six weekday bands with the saved values', async () => {
      show(shaft());
      await openSchedule();
      expect(screen.getAllByRole('row')).toHaveLength(7);
      expect(field('Espera 07:00 a 10:00').value).toBe('30');
      expect(field('Respuesta 17:00 a 24:00').value).toBe('5');
    });

    it('sends the edited band with configureShaft and leaves the weekend alone', async () => {
      const send = show(shaft());
      await openSchedule();
      await userEvent.selectOptions(
        screen.getByLabelText('Modo 07:00 a 10:00'),
        'Expreso hacia arriba',
      );
      await userEvent.clear(field('Espera 07:00 a 10:00'));
      await userEvent.type(field('Espera 07:00 a 10:00'), '20');
      await userEvent.clear(field('Respuesta 07:00 a 10:00'));
      await userEvent.type(field('Respuesta 07:00 a 10:00'), '10');
      await userEvent.click(applyButton());
      const sent = vi.mocked(send).mock.calls[0]?.[0];
      expect(sent).toMatchObject({ type: 'configureShaft', stops: [1, 2, 3], carHomes: [1] });
      if (sent?.type !== 'configureShaft') throw new Error('expected configureShaft');
      expect(sent.schedule.weekday[1]).toEqual({
        mode: 'expressUp',
        dwellSeconds: 20,
        responseDistance: 10,
      });
      expect(sent.schedule.weekday[0]).toEqual(band);
      expect(sent.schedule.weekend).toEqual(schedule.weekend);
    });

    it.each([
      ['Espera 07:00 a 10:00', '70', 'La espera va de 0 a 60 s, de 10 en 10.'],
      ['Espera 07:00 a 10:00', '25', 'La espera va de 0 a 60 s, de 10 en 10.'],
      ['Respuesta 07:00 a 10:00', '0', 'La respuesta va de 1 a 99 pisos.'],
      ['Respuesta 07:00 a 10:00', '100', 'La respuesta va de 1 a 99 pisos.'],
    ])('blocks %s = %s before sending', async (label, value, message) => {
      const send = show(shaft());
      await openSchedule();
      await userEvent.clear(field(label));
      await userEvent.type(field(label), value);
      expect(field(label).getAttribute('aria-invalid')).toBe('true');
      expect(screen.getByText(message)).toBeTruthy();
      expect(applyButton().disabled).toBe(true);
      await userEvent.click(applyButton());
      expect(send).not.toHaveBeenCalled();
    });

    it('edits the weekend bands apart and copies them over', async () => {
      const send = show(shaft());
      await openSchedule();
      await userEvent.click(screen.getByLabelText('Fin de semana'));
      await userEvent.selectOptions(
        screen.getByLabelText('Modo 00:00 a 07:00'),
        'Expreso hacia abajo',
      );
      await userEvent.click(screen.getByRole('button', { name: 'Copiar a días hábiles' }));
      await userEvent.click(applyButton());
      const sent = vi.mocked(send).mock.calls[0]?.[0];
      if (sent?.type !== 'configureShaft') throw new Error('expected configureShaft');
      expect(sent.schedule.weekend[0]?.mode).toBe('expressDown');
      expect(sent.schedule.weekday[0]?.mode).toBe('expressDown');
    });

    it('marks the band in force', async () => {
      render(
        <WindowLayer>
          <Open
            shaft={shaft()}
            send={vi.fn()}
            onClose={() => undefined}
            bandNow={{ dayType: 'weekday', index: 3 }}
          />
        </WindowLayer>,
      );
      await openSchedule();
      const now = screen.getAllByRole('row').filter((row) => row.getAttribute('aria-current'));
      expect(now).toHaveLength(1);
      expect(now[0]?.textContent).toContain('12:00 a 14:00');
    });

    it('shows INVALID_SCHEDULE in Spanish', async () => {
      show(
        shaft(),
        vi.fn(async (): Promise<CommandOutcome> => ({ ok: false, error: 'INVALID_SCHEDULE' })),
      );
      await openSchedule();
      await userEvent.selectOptions(
        screen.getByLabelText('Modo 00:00 a 07:00'),
        'Expreso hacia arriba',
      );
      await userEvent.click(applyButton());
      await waitFor(() =>
        expect(screen.getByRole('alert').textContent).toBe(
          'Revisá las paradas y las bases de las cabinas.',
        ),
      );
    });

    it('discards schedule edits and resyncs after the server saves them', async () => {
      const send = vi.fn(async (): Promise<CommandOutcome> => ({ ok: true, cost: 0, refund: 0 }));
      const view = (data: ShaftData) => (
        <WindowLayer>
          <Open shaft={data} send={send} onClose={() => undefined} />
        </WindowLayer>
      );
      const { rerender } = render(view(shaft()));
      await openSchedule();
      await userEvent.clear(field('Espera 00:00 a 07:00'));
      await userEvent.type(field('Espera 00:00 a 07:00'), '60');
      await userEvent.click(screen.getByRole('button', { name: 'Descartar' }));
      expect(field('Espera 00:00 a 07:00').value).toBe('30');
      const saved = {
        weekday: schedule.weekday.map((entry, index) =>
          index === 2 ? { ...entry, dwellSeconds: 50 } : entry,
        ),
        weekend: schedule.weekend,
      } as ShaftData['schedule'];
      rerender(view(shaft({ schedule: saved })));
      await waitFor(() => expect(field('Espera 10:00 a 12:00').value).toBe('50'));
      expect(applyButton().disabled).toBe(true);
    });
  });

  it('resyncs the draft when a car is added or removed', async () => {
    const send = vi.fn(async (): Promise<CommandOutcome> => ({ ok: true, cost: 0, refund: 0 }));
    const props = (data: ShaftData) => (
      <WindowLayer>
        <Open shaft={data} send={send} onClose={() => undefined} />
      </WindowLayer>
    );
    const { rerender } = render(props(shaft()));
    await userEvent.click(screen.getByLabelText('Para en 2'));
    rerender(
      props(
        shaft({
          stops: [1, 2, 3],
          cars: [
            { index: 0, homeLevel: 1, load: 0 },
            { index: 1, homeLevel: 3, load: 0 },
          ],
        }),
      ),
    );
    await waitFor(() =>
      expect((screen.getByLabelText('Para en 2') as HTMLInputElement).checked).toBe(true),
    );
    await userEvent.click(screen.getByLabelText('Para en 1'));
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'configureShaft', stops: [2, 3], carHomes: [2, 3] }),
    );
  });
});

describe('Schedule field width', () => {
  it('keeps the dwell and response fields 40 wide so the table fits the window', () => {
    const css = readFileSync(resolve(__dirname, 'elevatorWindow.css'), 'utf8');
    const start = css.indexOf('.elevator-schedule .tm-input {');
    expect(css.slice(start, css.indexOf('}', start))).toContain('width: calc(40 * var(--tm-px))');
  });
});
