import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import type { ClientMessage, ServerMessage, UnitView } from '@tower-magnate/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
    price: 10_000,
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
    price: 10_000,
    appraisal: 10_000,
    priceBand: 'normal',
    priceMin: 2_000,
    priceMax: 20_000,
    priceStep: 1,
    occupantScore: 3,
    listed: true,
    weeklyRent: 10_000,
    nextPaymentStep: null,
    workers: ['p1', 'p2'],
    customers: [],
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
    upgrades: [],
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

  it('shows the subtitle and stat tiles in the window, and no next payment for an office', () => {
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
    expect(within(dialog).queryByText(/^Próximo pago · /)).toBeNull();
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

  it('has no name field, only the pencil beside the title', () => {
    const { open, show } = setup([unitView('u1')]);
    open('u1');
    show(inspectOf('u1'));
    const dialog = screen.getByRole('dialog', { name: 'Oficina · Piso 3' });
    expect(within(dialog).queryByLabelText('Nombre')).toBeNull();
    const pencil = within(dialog).getByRole('button', { name: 'Cambiar nombre' });
    expect(pencil.closest('.tm-window__title')).toBeTruthy();
  });

  it('renames from the pencil: Aceptar and Enter send the name, an empty name clears it', () => {
    const { open, show, commandsSent } = setup([unitView('u1')]);
    open('u1');
    show(inspectOf('u1'));
    const rename = (value: string, how: 'click' | 'enter'): void => {
      fireEvent.click(screen.getByRole('button', { name: 'Cambiar nombre' }));
      const prompt = screen.getByRole('alertdialog', { name: 'Cambiar nombre' });
      const field = within(prompt).getByLabelText('Nombre');
      fireEvent.input(field, { target: { value } });
      if (how === 'enter') fireEvent.keyDown(field, { key: 'Enter' });
      else fireEvent.click(within(prompt).getByRole('button', { name: 'Aceptar' }));
      expect(screen.queryByRole('alertdialog', { name: 'Cambiar nombre' })).toBeNull();
    };
    rename('Estudio', 'click');
    show(inspectOf('u1', { name: 'Estudio' }));
    rename('Otro', 'enter');
    show(inspectOf('u1', { name: 'Otro' }));
    rename('', 'click');
    expect(commandsSent()).toEqual([
      { type: 'renameUnit', unitId: 'u1', name: 'Estudio' },
      { type: 'renameUnit', unitId: 'u1', name: 'Otro' },
      { type: 'renameUnit', unitId: 'u1', name: '' },
    ]);
  });

  it('opens the rename window with the current name and sends nothing on Cancelar or no change', () => {
    const { open, show, commandsSent } = setup([unitView('u1')]);
    open('u1');
    show(inspectOf('u1', { name: 'Estudio' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar nombre' }));
    let prompt = screen.getByRole('alertdialog', { name: 'Cambiar nombre' });
    const field = within(prompt).getByLabelText('Nombre') as HTMLInputElement;
    expect(field.value).toBe('Estudio');
    fireEvent.input(field, { target: { value: 'Otro' } });
    fireEvent.click(within(prompt).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('alertdialog', { name: 'Cambiar nombre' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar nombre' }));
    prompt = screen.getByRole('alertdialog', { name: 'Cambiar nombre' });
    expect((within(prompt).getByLabelText('Nombre') as HTMLInputElement).value).toBe('Estudio');
    fireEvent.click(within(prompt).getByRole('button', { name: 'Aceptar' }));
    expect(commandsSent()).toEqual([]);
  });

  it('sends the price once, when the bar is let go, and follows the next inspect', () => {
    const { open, show, commandsSent } = setup([unitView('u1')]);
    open('u1');
    show(inspectOf('u1'));
    const bar = screen.getByRole('slider', { name: 'Ajustar el precio' }) as HTMLInputElement;
    fireEvent.input(bar, { target: { value: '5000' } });
    fireEvent.input(bar, { target: { value: '6000' } });
    expect(commandsSent()).toEqual([]);
    fireEvent.change(bar, { target: { value: '6000' } });
    expect(commandsSent()).toEqual([{ type: 'setPrice', unitId: 'u1', price: 6000 }]);
    show(inspectOf('u1', { details: leaseDetails({ price: 6000, priceBand: 'low' }) }));
    const after = screen.getByRole('slider', { name: 'Ajustar el precio' }) as HTMLInputElement;
    expect(after.value).toBe('6000');
    expect(screen.getByText('Bajo')).toBeTruthy();
  });

  it('sends a typed price clamped to the limits', () => {
    const { open, show, commandsSent } = setup([unitView('u1')]);
    open('u1');
    show(inspectOf('u1'));
    const field = screen.getByRole('spinbutton');
    fireEvent.input(field, { target: { value: '99999' } });
    fireEvent.blur(field);
    expect(commandsSent()).toEqual([{ type: 'setPrice', unitId: 'u1', price: 20_000 }]);
  });

  it('shows no price control, no sold tile and no status for a sold condo', () => {
    const { open, show } = setup([unitView('u1', 'condo')]);
    open('u1');
    show(
      inspectOf('u1', {
        type: 'condo',
        details: {
          group: 'condo',
          state: 'sold',
          residents: ['p1', 'p2'],
          residentCount: 2,
          capacity: 3,
          evaluation: null,
          price: 200_000,
          appraisal: 200_000,
          priceBand: 'normal',
          priceMin: 50_000,
          priceMax: 400_000,
          priceStep: 1,
          occupantScore: 3,
          listed: false,
          nextEvaluationStep: null,
        },
      }),
    );
    expect(screen.queryByRole('slider', { name: 'Ajustar el precio' })).toBeNull();
    expect(screen.queryByText('Vendido')).toBeNull();
    expect(screen.queryByText('Estado')).toBeNull();
    expect(screen.queryByLabelText('En venta')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Ver a esta persona' })).toHaveLength(2);
  });

  it('opens a person window from the people row', () => {
    const { open, show, inspect } = setup([unitView('u1')]);
    open('u1');
    show(inspectOf('u1'));
    const requested: string[] = [];
    inspect.onPersonWindowRequest((id: string) => requested.push(id));
    const buttons = screen.getAllByRole('button', { name: 'Ver a esta persona' });
    fireEvent.click(buttons[1] as HTMLElement);
    expect(requested).toEqual(['p2']);
  });

  it('shows the office workers first with no heading, and no appraisal, location or note', () => {
    const { open, show } = setup([unitView('u1')]);
    open('u1');
    show(inspectOf('u1'));
    const dialog = screen.getByRole('dialog');
    const people = dialog.querySelector('.tm-unit__people') as HTMLElement;
    expect(dialog.querySelector('.tm-window__body')?.firstElementChild).toBe(people);
    expect(within(people).queryByRole('heading')).toBeNull();
    expect(
      within(people).getAllByRole('button', { name: 'Ver a esta persona' }).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText('Tasación')).toBeNull();
    expect(screen.queryByText('Ubicación')).toBeNull();
    expect(screen.queryByText(/Sin tilde/)).toBeNull();
    expect(screen.queryByText('Trabajadores')).toBeNull();
  });

  it('stands the office workers in rows of 3, side by side', () => {
    const { open, show } = setup([unitView('u1')]);
    open('u1');
    const workers = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'];
    show(inspectOf('u1', { details: leaseDetails({ workers, persons: 7 }) }));
    const people = screen.getByRole('dialog').querySelector('.tm-unit__people') as HTMLElement;
    const rows = [...people.querySelectorAll('.tm-unit__queue-row')];
    expect(rows.map((row) => row.querySelectorAll('li').length)).toEqual([3, 3, 1]);
    for (const row of rows) {
      expect(row.classList.contains('is-grid')).toBe(true);
      for (const li of row.querySelectorAll('li'))
        expect((li as HTMLElement).style.marginLeft).toBe('');
    }
  });

  it('shows the points for and against as a tooltip on the evaluation tile, not in the window', () => {
    vi.useFakeTimers();
    try {
      const { open, show } = setup([unitView('u1')]);
      open('u1');
      const evaluationParts = {
        occupantScore: 1,
        fairPrice: 10_000,
        noisy: true,
        mainCause: null,
        neighborPull: false,
      };
      show(inspectOf('u1', { details: leaseDetails({ evaluationParts }) }));
      expect(screen.getByRole('dialog').querySelector('.tm-unit__reasons')).toBeNull();
      const tile = screen.getByText('Evaluación').closest('.tm-unit__tile') as HTMLElement;
      fireEvent.pointerEnter(tile.closest('.tm-tooltip-anchor') as HTMLElement);
      act(() => {
        vi.advanceTimersByTime(600);
      });
      const lines = [...screen.getByRole('tooltip').querySelectorAll('.tm-tooltip__line')];
      expect(lines.map((line) => line.textContent)).toEqual([
        'A favor',
        '+ Alquiler dentro del precio justo',
        '+ Trabajadores tranquilos',
        'En contra',
        '- Ruido cerca',
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('sets the price and listing of a unit still under construction', () => {
    const { open, show, commandsSent } = setup([unitView('u1')]);
    open('u1');
    show(
      inspectOf('u1', {
        details: {
          group: 'construction',
          price: 10_000,
          appraisal: 10_000,
          priceBand: 'normal',
          priceMin: 4_000,
          priceMax: 25_000,
          priceStep: 1,
          listed: true,
        },
      }),
    );
    const bar = screen.getByRole('slider', { name: 'Ajustar el precio' });
    fireEvent.change(bar, { target: { value: '8000' } });
    fireEvent.click(screen.getByLabelText('En renta'));
    expect(commandsSent()).toEqual([
      { type: 'setPrice', unitId: 'u1', price: 8000 },
      { type: 'setListed', unitId: 'u1', listed: false },
    ]);
  });

  it('shows a priority checkbox only for a site and sends the command', () => {
    const { open, show, commandsSent } = setup([unitView('u1')]);
    open('u1');
    show(inspectOf('u1', { details: { group: 'construction', priority: false } }));
    const box = screen.getByLabelText('Prioridad') as HTMLInputElement;
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    expect(commandsSent()).toEqual([{ type: 'setSitePriority', unitId: 'u1', priority: true }]);
  });

  it('lists the upgrades with their level and sends the purchase', () => {
    const { open, show, commandsSent } = setup([unitView('u1')], 60_000);
    open('u1');
    show(
      inspectOf('u1', {
        type: 'security',
        details: null,
        upgrades: [
          { id: 'cameras', level: 1, maxLevel: 3, nextPrice: 50_000 },
          { id: 'guards', level: 0, maxLevel: 3, nextPrice: 25_000 },
          { id: 'accessControl', level: 2, maxLevel: 2, nextPrice: null },
        ],
      }),
    );
    expect(screen.getByText('Mejoras')).toBeTruthy();
    expect(screen.getByText('1/3')).toBeTruthy();
    expect(screen.getByText('Máximo').closest('button')?.disabled).toBe(true);
    fireEvent.click(screen.getByText(/^Comprar.*50\.000/));
    expect(commandsSent()).toEqual([{ type: 'buyUpgrade', unitId: 'u1', upgradeId: 'cameras' }]);
  });

  it('has no priority checkbox on a finished unit', () => {
    const { open, show } = setup([unitView('u1')]);
    open('u1');
    show(inspectOf('u1'));
    expect(screen.queryByLabelText('Prioridad')).toBeNull();
  });

  it('lists the office for rent with a checkbox', () => {
    const { open, show, commandsSent } = setup([unitView('u1')]);
    open('u1');
    show(inspectOf('u1'));
    const box = screen.getByLabelText('En renta') as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    expect(commandsSent()).toEqual([{ type: 'setListed', unitId: 'u1', listed: false }]);
  });

  it('shows the fast food hours and switch, and a note while the switch waits for tomorrow', () => {
    const { open, show, commandsSent } = setup([unitView('u1', 'fast-food')]);
    open('u1');
    show(
      inspectOf('u1', {
        type: 'fast-food',
        details: {
          group: 'venue',
          served: 0,
          inside: 0,
          workers: ['p1'],
          workersInside: 0,
          customers: [],
          opens: 8,
          closes: 20,
          hours: { open: 8, close: 20 },
          enabled: false,
          activeToday: true,
          resultToday: 0,
          today: [],
          average: [],
        },
      }),
    );
    expect(screen.getByText('Horario 08:00 a 20:00')).toBeTruthy();
    expect(screen.getByText('Se aplica desde mañana.')).toBeTruthy();
    expect(screen.getByText('Personal')).toBeTruthy();
    const table = document.querySelector('.tm-unit__table') as HTMLElement;
    expect(within(table).getByText('Atendidos').closest('tr')?.textContent).toBe('Atendidos0');
    expect(within(table).queryByText('Adentro')).toBeNull();
    expect(table.querySelector('tfoot')?.textContent).toContain('Resultado');
    expect(document.querySelector('.tm-unit__tile')).toBeNull();
    expect(screen.getByText('Clientes')).toBeTruthy();
    const close = screen.getByRole('slider', { name: 'Hora de cierre' });
    fireEvent.input(close, { target: { value: '22' } });
    expect(screen.getByText('Horario 08:00 a 22:00')).toBeTruthy();
    expect(commandsSent()).toEqual([]);
    fireEvent.change(close, { target: { value: '22' } });
    expect(commandsSent()).toEqual([{ type: 'setVenueHours', unitId: 'u1', open: 8, close: 22 }]);
    fireEvent.click(screen.getByLabelText('Habilitado'));
    expect(commandsSent().at(-1)).toEqual({ type: 'setVenueEnabled', unitId: 'u1', enabled: true });
  });

  it('shows a unit the server reports gone, with controls disabled', () => {
    const { open, show } = setup([unitView('u1')]);
    open('u1');
    show(inspectOf('u1'));
    show({ kind: 'unit', id: 'u1', status: 'gone' });
    expect(screen.getByText('Ya no está en la torre.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cambiar nombre' })).toBeNull();
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
    expect(screen.queryByRole('button', { name: 'Cambiar nombre' })).toBeNull();
    expect(
      (screen.getByRole('slider', { name: 'Ajustar el precio' }) as HTMLInputElement).disabled,
    ).toBe(true);
  });

  describe('fixed panel of the Lupa', () => {
    const at = (x: number, y: number) => ({ x, y, width: 40, height: 30 });

    function panelSetup() {
      const stage = fakeStage({ u1: at(100, 80), u2: at(300, 200) });
      const world = setup(
        [unitView('u1'), unitView('u2')],
        2_000_000,
        stage as unknown as PanelStage,
      );
      const anchor = (id: string): void => {
        act(() => world.inspect.anchorUnit(id));
        world.show(inspectOf(id, { name: `Unidad ${id}` }));
      };
      const panel = (id: string) => screen.getByRole('dialog', { name: `Unidad ${id}` });
      return { ...world, stage, anchor, panel };
    }

    it('shows next to the unit with a close button and no drag', () => {
      const { anchor, panel, sent } = panelSetup();
      anchor('u1');
      const frame = panel('u1');
      expect(within(frame).getAllByRole('button', { name: /cerrar/i })).toHaveLength(1);
      expect(frame.style.left).toBe('148px');
      expect(frame.style.top).toBe('80px');
      const title = frame.querySelector('.tm-window__title') as HTMLElement;
      fireEvent.pointerDown(title, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
      fireEvent.pointerMove(title, { clientX: 300, clientY: 300, pointerId: 1 });
      expect(frame.style.left).toBe('148px');
      expect(sent.at(-1)).toMatchObject({
        t: 'inspectAdd',
        p: { target: { kind: 'unit', id: 'u1' } },
      });
    });

    it('closes from its close button', () => {
      const { anchor, panel, inspect } = panelSetup();
      anchor('u1');
      fireEvent.click(within(panel('u1')).getByRole('button', { name: /cerrar/i }));
      expect(inspect.anchoredUnit()).toBeNull();
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
        details: { group: 'cinema', filmWeek: 2, filmAgeDays: 9 },
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
