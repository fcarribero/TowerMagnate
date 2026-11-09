import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact';
import type { ClientMessage } from '@tower-magnate/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { ClientStore } from '../../model/clientStore';
import { InspectStore } from '../../model/inspectStore';
import { CommandClient } from '../../net/commandClient';
import type { GameConnection } from '../../net/gameConnection';
import { useFakeLayoutSizes } from '../../testing/fakeLayout';
import { snapshot } from '../../testing/protocolFixtures';
import { WindowLayer } from '../kit';
import { UnitWindows } from '../unit/UnitWindows';
import { ElevatorWindows } from './ElevatorWindows';
import type { ShaftData } from './ElevatorWindow';

useFakeLayoutSizes({ clientWidth: 800, clientHeight: 600, offsetWidth: 200, offsetHeight: 100 });
afterEach(cleanup);

const band = { mode: 'normal', dwellSeconds: 30, responseDistance: 5 } as const;
const schedule = {
  weekday: Array.from({ length: 6 }, () => band),
  weekend: Array.from({ length: 6 }, () => band),
} as unknown as ShaftData['schedule'];

const shaftData: ShaftData = {
  kind: 'shaft',
  id: 's4',
  status: 'ok',
  type: 'express',
  bottom: 1,
  top: 3,
  stops: [1, 3],
  cars: [{ index: 0, homeLevel: 1, load: 0 }],
  schedule,
};

function setup() {
  const sent: ClientMessage[] = [];
  const store = new ClientStore({ requestResync: () => undefined, now: () => 0 });
  store.applySnapshot(snapshot);
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
      <ElevatorWindows connection={connection} />
    </WindowLayer>,
  );
  return { inspect, sent };
}

describe('elevator windows', () => {
  it('opens from a shaft request, inspects the shaft and shows the car price', () => {
    const { inspect, sent } = setup();
    act(() => inspect.requestShaftWindow('s4'));
    act(() => inspect.receive({ v: 1, t: 'inspect', p: shaftData }));
    expect(sent.at(-1)).toMatchObject({
      t: 'inspectAdd',
      p: { target: { kind: 'shaft', id: 's4' } },
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Cabinas' }));
    expect(screen.getByRole('button', { name: 'Agregar cabina ($150.000)' })).toBeTruthy();
  });

  it('marks the band in force from the game clock', () => {
    const { inspect } = setup();
    act(() => inspect.requestShaftWindow('s4'));
    act(() => inspect.receive({ v: 1, t: 'inspect', p: shaftData }));
    fireEvent.click(screen.getByRole('tab', { name: 'Horarios' }));
    const now = document.querySelector('tr[aria-current="time"]');
    expect(now?.textContent).toContain('00:00 a 07:00');
    expect(now?.textContent).toContain('En curso');
  });

  it('stops inspecting when the window closes', () => {
    const { inspect, sent } = setup();
    act(() => inspect.requestShaftWindow('s4'));
    act(() => inspect.receive({ v: 1, t: 'inspect', p: shaftData }));
    fireEvent.click(screen.getByRole('button', { name: /cerrar/i }));
    expect(sent.at(-1)).toMatchObject({
      t: 'inspectRemove',
      p: { target: { kind: 'shaft', id: 's4' } },
    });
  });

  it('closes the window when the shaft is gone', () => {
    const { inspect, sent } = setup();
    act(() => inspect.requestShaftWindow('s4'));
    act(() => inspect.receive({ v: 1, t: 'inspect', p: shaftData }));
    act(() =>
      inspect.receive({ v: 1, t: 'inspect', p: { kind: 'shaft', id: 's4', status: 'gone' } }),
    );
    expect(screen.queryByRole('tab', { name: 'Cabinas' })).toBeNull();
    expect(sent.at(-1)).toMatchObject({
      t: 'inspectRemove',
      p: { target: { kind: 'shaft', id: 's4' } },
    });
  });
});
