import { useEffect, useState } from 'preact/hooks';
import type { GameConnection } from '../../net/gameConnection';
import { ELEVATOR_WINDOW_KIND, elevatorWindowId, entityOfWindow } from '../inspectTarget';
import { useWindowManager } from '../kit';
import { ElevatorWindow } from './ElevatorWindow';

const FIRST_WINDOW_POSITION = { x: 60, y: 60 };
const CASCADE_STEP = 12;

interface ElevatorWindowsProps {
  connection: Pick<GameConnection, 'store' | 'inspect' | 'commands'>;
}

function useShaftInspect(connection: ElevatorWindowsProps['connection'], shaftId: string) {
  const { inspect } = connection;
  const [data, setData] = useState(() => inspect.shaft(shaftId));
  useEffect(() => {
    setData(inspect.shaft(shaftId));
    return inspect.subscribe(() => setData(inspect.shaft(shaftId)));
  }, [inspect, shaftId]);
  return data;
}

function OpenElevatorWindow({
  shaftId,
  connection,
}: {
  shaftId: string;
  connection: ElevatorWindowsProps['connection'];
}) {
  const manager = useWindowManager();
  const data = useShaftInspect(connection, shaftId);
  const windowId = elevatorWindowId(shaftId);
  const close = (): void => {
    connection.inspect.forgetShaft(shaftId);
    manager.close(windowId);
  };
  if (data === undefined) {
    return null;
  }
  return (
    <ElevatorWindow
      shaft={data}
      send={(command) => connection.commands.send(command)}
      onClose={close}
    />
  );
}

/** Opens an elevator window whenever the Lupa asks for one; the server inspects the shaft while it is in front. */
export function ElevatorWindows({ connection }: ElevatorWindowsProps) {
  const manager = useWindowManager();
  const elevatorWindows = manager.stack.windows.filter(
    (window) => window.kind === ELEVATOR_WINDOW_KIND,
  );

  useEffect(
    () =>
      connection.inspect.onShaftWindowRequest((shaftId) => {
        const offset = (manager.stack.openCount % 4) * CASCADE_STEP;
        manager.open({
          id: elevatorWindowId(shaftId),
          kind: ELEVATOR_WINDOW_KIND,
          position: { x: FIRST_WINDOW_POSITION.x + offset, y: FIRST_WINDOW_POSITION.y + offset },
        });
      }),
    [connection, manager],
  );

  return (
    <>
      {elevatorWindows.map((window) => (
        <OpenElevatorWindow
          key={window.id}
          shaftId={entityOfWindow(window.id)}
          connection={connection}
        />
      ))}
    </>
  );
}
