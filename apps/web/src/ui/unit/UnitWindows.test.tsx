import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import type { ClientMessage, ServerMessage, UnitView } from '@tower-magnate/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { ClientStore } from '../../model/clientStore';
import { InspectStore, type UnitInspect, type UnitInspectData } from '../../model/inspectStore';
import { CommandClient } from '../../net/commandClient';
import type { GameConnection } from '../../net/gameConnection';
import { useFakeLayoutSizes } from '../../testing/fakeLayout';
import { snapshot } from '../../testing/protocolFixtures';
import { WindowLayer } from '../kit';
import { UnitWindows, type PanelStage } from './UnitWindows';

useFakeLayoutSizes({ clientWidth: 800, clientHeight: 600, offsetWidth: 150, offsetHeight: 100 });

afterEach(cleanup);

function unitView(id: string, type: UnitView['type'] = 'office'): UnitView {
  return {
    id,
    type,
    x: 10,
    level: 3,
    name: null,
    price: 'normal',
    occupied: true,
    variant: 'occupied',
  };
}

type Details = NonNullable<UnitInspect['details']>;

function leaseDetails(fields: Partial<Extract<Details, { group: 'lease' }>> = {}): Details {
  return {
    group: 'lease',
    state: 'occupied',
    persons: 2,
    capacity: 6,
    evaluation: 'good',
    price: 'normal',
    leaseWeek: 1,
    nextPaymentStep: null,
    ...fields,
  };
}

function inspectOf(id: string, fields: Partial<UnitInspect> = {}): UnitInspect {
  return {
    kind: 'unit',
    id,
    status: 'ok',
    type: 'office',
    name: null,
    level: 3,
    from: 10,
    to: 18,
    details: leaseDetails(),
    ...fields,
  };
}

function fakeStage(rects: Record<string, { x: number; y: number; width: number; height: number }>) {
  const listeners = new Set<(camera: unknown) => void>();
  return {
    rects,
    unitScreenRect: (id: string) => rects[id] ?? null,
    cssPerDevicePixel: () => 1,
    onCameraChange: (listener: (camera: unknown) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    pan: () => listeners.forEach((listener) => listener({})),
  };
}

function setup(units: UnitView[], money = 2_000_000, stage: PanelStage | null = null) {
  const sent: ClientMessage[] = [];
  const store = new ClientStore({ requestResync: () => undefined, now: () => 0 });
  store.applySnapshot({ ...snapshot, money, units });
  const inspect = new InspectStore();
  const commands = new CommandClient({
    send: (message) => {
      sent.push(message);
      return true;
    },
  });
  const connection = { store, inspect, commands } as unknown as GameConnection;
  render(
    <WindowLayer>
      <UnitWindows connection={connection} stage={stage} />
    </WindowLayer>,
  );
  const receive = (message: ServerMessage): void => {
    act(() => inspect.receive(message));
  };
  const show = (data: UnitInspectData): void => receive({ v: 1, t: 'inspect', p: data });
  const open = (id: string): void => {
    act(() => inspect.requestUnitWindow(id));
  };
  const commandsSent = () =>
    sent.flatMap((message) => (message.t === 'command' ? [message.p.command] : []));
  return { store, inspect, show, open, commandsSent, sent };
}

describe('unit windows', () => {
  it('opens with the type and level in the title and sends the inspect target', () => {
    const { open, show, sent } = setup([unitView('u1')]);
    open('u1');
    show(inspectOf('u1'));
    expect(screen.getByRole('dialog', { name: 'Oficina · Piso 3' })).toBeTruthy();
    expect(sent.at(-1)).toMatchObject({
      t: 'inspectAdd',
      p: { target: { kind: 'unit', id: 'u1' } },
    });
  });

  it('shows no subtitle for a unit without a custom name', () => {
    const { open, show } = setup([unitView('u1')]);
    open('u1');
    show(inspectOf('u1'));
    const dialog = screen.getByRole('dialog', { name: 'Oficina · Piso 3' });
    expect(dialog.className).not.toContain('tm-window--subtitled');
    expect(dialog.querySelector('.tm-window__subtitle')).toBeNull();
  });

  it('shows the subtitle, stat tiles and contract chip in the window', () => {
    const { open, show } = setup([unitView('u1')]);
    open('u1');
    show(inspectOf('u1', { name: 'Mi estudio', details: leaseDetails({ nextPaymentStep: 0 }) }));
    const dialog = screen.getByRole('dialog', { name: 'Mi estudio' });
    const subtitle = within(dialog).getByText('Oficina · Piso 3');
    expect(subtitle.className).toBe('tm-window__subtitle');
    expect(dialog.className).toContain('tm-window--subtitled');
    expect(subtitle.closest('.tm-window__title')).toBeTruthy();
    const status = within(dialog).getByText('Ocupada').parentElement;
    expect(status?.className).toContain('is-good');
    const evaluation = within(dialog).getByText('Buena').parentElement;
    expect(evaluation?.className).toContain('is-good');
    expect(within(dialog).getByText('Contrato · Semana 1 de 4')).toBeTruthy();
    expect(within(dialog).getByText(/^Próximo pago · /)).toBeTruthy();
  });

  it('inspects every open unit window and stops only the closed one', () => {
    const { open, show, sent } = setup([unitView('u1'), unitView('u2'), unitView('u3')]);
    for (const id of ['u1', 'u2', 'u3']) {
      open(id);
      show(inspectOf(id, { name: `Unidad ${id}` }));
    }
    const adds = sent.filter((message) => message.t === 'inspectAdd');
    expect(adds).toHaveLength(3);
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Unidad u3' })).getByRole('button', {
        name: /cerrar/i,
      }),
    );
    expect(sent.at(-1)).toMatchObject({
      t: 'inspectRemove',
      p: { target: { kind: 'unit', id: 'u3' } },
    });
    expect(sent.filter((message) => message.t === 'inspectRemove')).toHaveLength(1);
    show(inspectOf('u1', { name: 'Nuevo' }));
    expect(screen.getByRole('dialog', { name: 'Nuevo' })).toBeTruthy();
  });

  it('renames on Enter and on blur, and an empty name clears it', () => {
    const { open, show, commandsSent } = setup([unitView('u1')]);
    open('u1');
    show(inspectOf('u1'));
    const field = screen.getByLabelText('Nombre');
    fireEvent.input(field, { target: { value: 'Estudio' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    fireEvent.input(field, { target: { value: 'Otro' } });
    fireEvent.blur(field);
    show(inspectOf('u1', { name: 'Otro' }));
    fireEvent.input(screen.getByLabelText('Nombre'), { target: { value: '' } });
    fireEvent.blur(screen.getByLabelText('Nombre'));
    expect(commandsSent()).toEqual([
      { type: 'renameUnit', unitId: 'u1', name: 'Estudio' },
      { type: 'renameUnit', unitId: 'u1', name: 'Otro' },
      { type: 'renameUnit', unitId: 'u1', name: '' },
    ]);
  });

  it('does not send a rename when the name did not change', () => {
    const { open, show, commandsSent } = setup([unitView('u1')]);
    open('u1');
    show(inspectOf('u1', { name: 'Estudio' }));
    const field = screen.getByLabelText('Nombre');
    fireEvent.input(field, { target: { value: 'Estudio' } });
    fireEvent.blur(field);
    expect(commandsSent()).toEqual([]);
  });

  it('sends the price at once and follows the next inspect', () => {
    const { open, show, commandsSent } = setup([unitView('u1')]);
    open('u1');
    show(inspectOf('u1'));
    const low = screen.getByRole('radio', { name: 'Bajo $5.000' }) as HTMLInputElement;
    fireEvent.click(low);
    expect(commandsSent()).toEqual([{ type: 'setPrice', unitId: 'u1', price: 'low' }]);
    expect(
      (screen.getByRole('radio', { name: 'Normal $10.000' }) as HTMLInputElement).checked,
    ).toBe(true);
    show(inspectOf('u1', { details: leaseDetails({ price: 'low' }) }));
    expect((screen.getByRole('radio', { name: 'Bajo $5.000' }) as HTMLInputElement).checked).toBe(
      true,
    );
  });

  it('disables the price of a sold condo', () => {
    const { open, show } = setup([unitView('u1', 'condo')]);
    open('u1');
    show(
      inspectOf('u1', {
        type: 'condo',
        details: {
          group: 'condo',
          state: 'sold',
          residents: 2,
          capacity: 3,
          evaluation: null,
          price: 'normal',
          nextEvaluationStep: null,
        },
      }),
    );
    expect(screen.getByText('Ya está vendido.')).toBeTruthy();
    expect(
      (screen.getByRole('radio', { name: 'Alto $230.000' }) as HTMLInputElement).matches(
        ':disabled',
      ),
    ).toBe(true);
  });

  it('shows a unit the server reports gone, with controls disabled', () => {
    const { open, show } = setup([unitView('u1')]);
    open('u1');
    show(inspectOf('u1'));
    show({ kind: 'unit', id: 'u1', status: 'gone' });
    expect(screen.getByText('Ya no está en la torre.')).toBeTruthy();
    expect((screen.getByLabelText('Nombre') as HTMLInputElement).disabled).toBe(true);
  });

  it('keeps four windows and closes the oldest on a fifth', () => {
    const ids = ['u1', 'u2', 'u3', 'u4', 'u5'];
    const { open, show } = setup(ids.map((id) => unitView(id)));
    for (const id of ids) {
      open(id);
      show(inspectOf(id, { name: `Unidad ${id}` }));
    }
    expect(screen.getAllByRole('dialog')).toHaveLength(4);
    expect(screen.queryByRole('dialog', { name: 'Unidad u1' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Unidad u5' })).toBeTruthy();
  });

  it('shows a demolished unit as gone, with controls disabled', () => {
    const { open, show, store } = setup([unitView('u1')]);
    open('u1');
    show(inspectOf('u1'));
    act(() => store.applySnapshot({ ...snapshot, units: [] }));
    expect(screen.getByText('Ya no está en la torre.')).toBeTruthy();
    expect((screen.getByLabelText('Nombre') as HTMLInputElement).disabled).toBe(true);
    expect(
      (screen.getByRole('radio', { name: 'Normal $10.000' }) as HTMLInputElement).matches(
        ':disabled',
      ),
    ).toBe(true);
  });

  describe('fixed panel of the Lupa', () => {
    const at = (x: number, y: number) => ({ x, y, width: 40, height: 30 });

    function panelSetup() {
      const stage = fakeStage({ u1: at(100, 80), u2: at(300, 200) });
      const world = setup([unitView('u1'), unitView('u2')], 2_000_000, stage as unknown as PanelStage);
      const anchor = (id: string): void => {
        act(() => world.inspect.anchorUnit(id));
        world.show(inspectOf(id, { name: `Unidad ${id}` }));
      };
      const panel = (id: string) => screen.getByRole('dialog', { name: `Unidad ${id}` });
      return { ...world, stage, anchor, panel };
    }

    it('shows next to the unit with no close button and no drag', () => {
      const { anchor, panel, sent } = panelSetup();
      anchor('u1');
      const frame = panel('u1');
      expect(within(frame).queryByRole('button', { name: /cerrar/i })).toBeNull();
      expect(frame.style.left).toBe('148px');
      expect(frame.style.top).toBe('80px');
      const title = frame.querySelector('.tm-window__title') as HTMLElement;
      fireEvent.pointerDown(title, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
      fireEvent.pointerMove(title, { clientX: 300, clientY: 300, pointerId: 1 });
      expect(frame.style.left).toBe('148px');
      expect(sent.at(-1)).toMatchObject({ t: 'inspectAdd', p: { target: { kind: 'unit', id: 'u1' } } });
    });

    it('follows the unit when the camera moves', () => {
      const { anchor, panel, stage } = panelSetup();
      anchor('u1');
      stage.rects.u1 = at(160, 120);
      act(() => stage.pan());
      expect(panel('u1').style.left).toBe('208px');
      expect(panel('u1').style.top).toBe('120px');
    });

    it('moves to another unit and closes when the anchor clears', () => {
      const { anchor, panel, inspect, sent } = panelSetup();
      anchor('u1');
      anchor('u2');
      expect(screen.queryByRole('dialog', { name: 'Unidad u1' })).toBeNull();
      expect(panel('u2').style.left).toBe('348px');
      expect(sent.filter((message) => message.t === 'inspectRemove')).toHaveLength(1);
      act(() => inspect.clearAnchor());
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('closes on a press outside, but not on a press inside it', () => {
      const { anchor, panel, inspect } = panelSetup();
      anchor('u1');
      fireEvent.pointerDown(panel('u1'));
      expect(inspect.anchoredUnit()).toBe('u1');
      fireEvent.pointerDown(document.body);
      expect(inspect.anchoredUnit()).toBeNull();
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('closes on Escape', () => {
      const { anchor, inspect } = panelSetup();
      anchor('u1');
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(inspect.anchoredUnit()).toBeNull();
    });

    it('keeps the list-opened unit window as it was, with its close button', () => {
      const { open, show, anchor, inspect } = panelSetup();
      open('u1');
      show(inspectOf('u1', { name: 'Lista' }));
      anchor('u2');
      const listed = screen.getByRole('dialog', { name: 'Lista' });
      expect(within(listed).getByRole('button', { name: /cerrar/i })).toBeTruthy();
      act(() => inspect.clearAnchor());
      expect(screen.getByRole('dialog', { name: 'Lista' })).toBeTruthy();
    });
  });

  describe('cinema', () => {
    const cinema = (fields: Partial<UnitInspect> = {}) =>
      inspectOf('u1', {
        type: 'cinema',
        details: { group: 'cinema', filmWeek: 2, filmAgeDays: 9, price: 'normal' },
        ...fields,
      });

    it('asks before changing the film', () => {
      const { open, show, commandsSent } = setup([unitView('u1', 'cinema')]);
      open('u1');
      show(cinema());
      expect(screen.getByText('Semana 2 (día 9)')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Cambiar película ($300.000)' }));
      expect(commandsSent()).toEqual([]);
      fireEvent.click(screen.getByRole('button', { name: 'Cambiar' }));
      expect(commandsSent()).toEqual([{ type: 'changeFilm', unitId: 'u1' }]);
    });

    it('asks with a plain action, a scrim and Cancelar focused', () => {
      const { open, show, commandsSent } = setup([unitView('u1', 'cinema')]);
      open('u1');
      show(cinema());
      fireEvent.click(screen.getByRole('button', { name: 'Cambiar película ($300.000)' }));

      const title = screen.getByText('Cambiar película', { selector: '.tm-window__title-text' });
      const frame = title.closest('section') as HTMLElement;
      expect(frame.classList.contains('tm-window--dialog-info')).toBe(false);
      expect(frame.querySelector('.tm-window__stripe')).not.toBeNull();
      expect(frame.querySelector('.tm-dialog__body')?.textContent).toBe(
        'La película nueva cuesta $300.000.',
      );
      const buttons = Array.from(frame.querySelectorAll('.tm-dialog__buttons button'));
      expect(buttons.map((button) => button.textContent)).toEqual(['Cambiar', 'Cancelar']);
      expect(buttons.some((button) => button.classList.contains('is-default'))).toBe(false);
      expect(document.activeElement).toBe(buttons[1]);

      fireEvent.click(document.querySelector('.tm-modal-backdrop') as HTMLElement);
      expect(screen.getByRole('button', { name: 'Cambiar' })).toBeTruthy();
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByRole('button', { name: 'Cambiar' })).toBeNull();
      expect(commandsSent()).toEqual([]);
    });

    it('disables the film change under $300.000', () => {
      const { open, show } = setup([unitView('u1', 'cinema')], 299_999);
      open('u1');
      show(cinema());
      const button = screen.getByRole('button', { name: 'Cambiar película ($300.000)' });
      expect((button as HTMLButtonElement).disabled).toBe(true);
    });
  });
});
