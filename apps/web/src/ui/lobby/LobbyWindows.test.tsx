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
import { LobbyWindows } from './LobbyWindows';

useFakeLayoutSizes({ clientWidth: 800, clientHeight: 600, offsetWidth: 150, offsetHeight: 100 });

afterEach(cleanup);

function setup(money: number) {
  const sent: ClientMessage[] = [];
  const store = new ClientStore({ requestResync: () => undefined, now: () => 0 });
  store.applySnapshot({ ...snapshot, money });
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
      <LobbyWindows connection={connection} />
    </WindowLayer>,
  );
  act(() => inspect.requestLobbyWindow('l1x4'));
  act(() =>
    inspect.receive({
      v: 1,
      t: 'inspect',
      p: {
        kind: 'lobby',
        id: 'l1x4',
        status: 'ok',
        level: 1,
        height: 1,
        from: 4,
        to: 40,
        upgrades: [
          { id: 'plants', level: 1, maxLevel: 3, nextPrice: 100_000 },
          { id: 'music', level: 3, maxLevel: 3, nextPrice: null },
          { id: 'lighting', level: 0, maxLevel: 3, nextPrice: 50_000 },
        ],
      },
    }),
  );
  const commandsSent = () =>
    sent.flatMap((message) => (message.t === 'command' ? [message.p.command] : []));
  return { commandsSent };
}

describe('LobbyWindows', () => {
  it('lists the lobby upgrades and buys one', () => {
    const { commandsSent } = setup(2_000_000);
    expect(screen.getByText('Plantas')).toBeTruthy();
    expect(screen.getByText('1/3')).toBeTruthy();
    expect(screen.getByText('Máximo').closest('button')?.disabled).toBe(true);
    fireEvent.click(screen.getByText(/Comprar .*50/));
    expect(commandsSent()).toContainEqual({ type: 'buyUpgrade', unitId: 'l1x4', upgradeId: 'lighting' });
  });

  it('disables a level the money does not cover', () => {
    setup(60_000);
    expect(screen.getByText(/Comprar .*100/).closest('button')?.disabled).toBe(true);
    expect(screen.getByText(/Comprar .*50/).closest('button')?.disabled).toBe(false);
  });
});
