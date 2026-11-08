import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact';
import type { ClientMessage, ServerMessage, UnitView } from '@tower-magnate/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { ClientStore } from '../../model/clientStore';
import { InspectStore, type UnitInspect } from '../../model/inspectStore';
import { CommandClient } from '../../net/commandClient';
import type { GameConnection } from '../../net/gameConnection';
import { useFakeLayoutSizes } from '../../testing/fakeLayout';
import { snapshot } from '../../testing/protocolFixtures';
import { WindowLayer } from '../kit';
import { UnitWindows } from './UnitWindows';

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

function inspectOf(id: string, fields: Partial<UnitInspect> = {}): UnitInspect {
  return {
    kind: 'unit',
    id,
    type: 'office',
    name: null,
    level: 3,
    x: 10,
    occupants: 2,
    capacity: 6,
    evaluation: 'good',
    price: 'normal',
    contract: { state: 'leased', week: 1, nextPaymentStep: null },
    hotelStayEndStep: null,
    filmAgeDays: null,
    ...fields,
  };
}

function setup(units: UnitView[], money = 2_000_000) {
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
      <UnitWindows connection={connection} />
    </WindowLayer>,
  );
  const receive = (message: ServerMessage): void => {
    act(() => inspect.receive(message));
  };
  const show = (data: UnitInspect): void => receive({ v: 1, t: 'inspect', p: data });
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
    expect(sent.at(-1)).toMatchObject({ t: 'inspect', p: { target: { kind: 'unit', id: 'u1' } } });
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
    show(inspectOf('u1', { price: 'low' }));
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
        capacity: 3,
        contract: { state: 'sold', week: null, nextPaymentStep: null },
      }),
    );
    expect(screen.getByText('Ya está vendido.')).toBeTruthy();
    expect(
      (screen.getByRole('radio', { name: 'Alto $200.000' }) as HTMLInputElement).matches(
        ':disabled',
      ),
    ).toBe(true);
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

  describe('cinema', () => {
    const cinema = (fields: Partial<UnitInspect> = {}) =>
      inspectOf('u1', { type: 'cinema', contract: null, filmAgeDays: 9, ...fields });

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

    it('disables the film change under $300.000', () => {
      const { open, show } = setup([unitView('u1', 'cinema')], 299_999);
      open('u1');
      show(cinema());
      const button = screen.getByRole('button', { name: 'Cambiar película ($300.000)' });
      expect((button as HTMLButtonElement).disabled).toBe(true);
    });
  });
});
