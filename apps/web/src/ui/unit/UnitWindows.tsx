import { useEffect } from 'preact/hooks';
import type { GameConnection } from '../../net/gameConnection';
import { useWindowManager } from '../kit';
import { UNIT_WINDOW_KIND, UnitWindow, unitWindowId } from './UnitWindow';

const FIRST_WINDOW_POSITION = { x: 40, y: 40 };
const CASCADE_STEP = 12;

interface UnitWindowsProps {
  connection: GameConnection;
}

/**
 * Opens a unit window whenever the Lupa asks for one, and keeps the server
 * inspecting the unit whose window is in front.
 */
export function UnitWindows({ connection }: UnitWindowsProps) {
  const manager = useWindowManager();
  const unitWindows = manager.stack.windows.filter((window) => window.kind === UNIT_WINDOW_KIND);
  const front = manager.stack.windows.at(-1);
  const frontUnitId =
    front?.kind === UNIT_WINDOW_KIND ? front.id.slice(UNIT_WINDOW_KIND.length + 1) : null;

  useEffect(
    () =>
      connection.inspect.onUnitWindowRequest((unitId) => {
        const offset = (manager.stack.openCount % 4) * CASCADE_STEP;
        manager.open({
          id: unitWindowId(unitId),
          kind: UNIT_WINDOW_KIND,
          position: { x: FIRST_WINDOW_POSITION.x + offset, y: FIRST_WINDOW_POSITION.y + offset },
        });
      }),
    [connection, manager],
  );

  useEffect(() => {
    connection.commands.inspect(frontUnitId === null ? null : { kind: 'unit', id: frontUnitId });
  }, [connection, frontUnitId]);

  return (
    <>
      {unitWindows.map((window) => (
        <UnitWindow
          key={window.id}
          unitId={window.id.slice(UNIT_WINDOW_KIND.length + 1)}
          connection={connection}
        />
      ))}
    </>
  );
}
