import { useEffect, useState } from 'preact/hooks';
import type { GameConnection } from '../../net/gameConnection';
import type { LobbyInspect } from '../../model/inspectStore';
import { entityOfWindow, LOBBY_WINDOW_KIND, lobbyWindowId } from '../inspectTarget';
import { Window, useWindowManager } from '../kit';
import { t } from '../strings';
import { UpgradeLine } from '../unit/UnitWindow';
import { levelText, typeName, upgradeRows } from '../unit/unitWindowModel';
import '../unit/unit.css';

const FIRST_WINDOW_POSITION = { x: 80, y: 80 };
const CASCADE_STEP = 12;

type LobbyConnection = Pick<GameConnection, 'store' | 'inspect' | 'commands'>;

function useLobbyInspect(connection: LobbyConnection, lobbyId: string): LobbyInspect | undefined {
  const { inspect } = connection;
  const [data, setData] = useState(() => inspect.lobby(lobbyId));
  useEffect(() => {
    setData(inspect.lobby(lobbyId));
    return inspect.subscribe(() => setData(inspect.lobby(lobbyId)));
  }, [inspect, lobbyId]);
  return data;
}

function useMoney(connection: LobbyConnection): number {
  const { store } = connection;
  const [money, setMoney] = useState(() => store.current?.latest.money ?? 0);
  useEffect(() => {
    setMoney(store.current?.latest.money ?? 0);
    return store.subscribe(() => setMoney(store.current?.latest.money ?? 0));
  }, [store]);
  return money;
}

/** The lobby window: the lobby's floor and its upgrades (service-units 2.4, ui.md 6.6). */
export function LobbyWindow({ lobbyId, connection }: { lobbyId: string; connection: LobbyConnection }) {
  const manager = useWindowManager();
  const data = useLobbyInspect(connection, lobbyId);
  const money = useMoney(connection);
  const windowId = lobbyWindowId(lobbyId);
  const close = (): void => {
    connection.inspect.forgetLobby(lobbyId);
    manager.close(windowId);
  };
  const gone = data?.status === 'gone';
  useEffect(() => {
    if (gone) {
      close();
    }
  }, [gone]);
  if (data === undefined || data.status === 'gone') {
    return null;
  }
  const title = t('window.unit.title', { type: typeName('lobby'), level: levelText(data.level) });
  return (
    <Window id={windowId} title={title} onClose={close} width={200}>
      <div class="tm-unit__upgrades">
        <h3 class="tm-unit__upgrades-title">{t('window.unit.upgrades')}</h3>
        {upgradeRows(data, money, false).map((row) => (
          <UpgradeLine
            key={row.id}
            row={row}
            onBuy={() => void connection.commands.buyUpgrade(lobbyId, row.id)}
          />
        ))}
      </div>
    </Window>
  );
}

/** Opens a lobby window whenever the Lupa asks for one; the server inspects the lobby while it is open. */
export function LobbyWindows({ connection }: { connection: LobbyConnection }) {
  const manager = useWindowManager();
  const lobbyWindows = manager.stack.windows.filter((window) => window.kind === LOBBY_WINDOW_KIND);

  useEffect(
    () =>
      connection.inspect.onLobbyWindowRequest((lobbyId) => {
        const offset = (manager.stack.openCount % 4) * CASCADE_STEP;
        manager.open({
          id: lobbyWindowId(lobbyId),
          kind: LOBBY_WINDOW_KIND,
          position: { x: FIRST_WINDOW_POSITION.x + offset, y: FIRST_WINDOW_POSITION.y + offset },
        });
      }),
    [connection, manager],
  );

  return (
    <>
      {lobbyWindows.map((window) => (
        <LobbyWindow
          key={window.id}
          lobbyId={entityOfWindow(window.id)}
          connection={connection}
        />
      ))}
    </>
  );
}
