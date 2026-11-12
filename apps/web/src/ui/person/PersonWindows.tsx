import { useEffect } from 'preact/hooks';
import type { GameConnection } from '../../net/gameConnection';
import { PERSON_WINDOW_KIND, entityOfWindow, personWindowId } from '../inspectTarget';
import { useWindowManager } from '../kit';
import { PersonWindow } from './PersonWindow';

const FIRST_WINDOW_POSITION = { x: 80, y: 80 };
const CASCADE_STEP = 12;

interface PersonWindowsProps {
  connection: GameConnection;
  onCenter: (point: { x: number; y: number }) => void;
}

/**
 * Opens a person window whenever the Lupa or Personas seguidas asks for one. The
 * unit windows host tells the server to inspect it, like every open window.
 */
export function PersonWindows({ connection, onCenter }: PersonWindowsProps) {
  const manager = useWindowManager();
  const personWindows = manager.stack.windows.filter(
    (window) => window.kind === PERSON_WINDOW_KIND,
  );

  useEffect(
    () =>
      connection.inspect.onPersonWindowRequest((personId) => {
        const offset = (manager.stack.openCount % 4) * CASCADE_STEP;
        manager.open({
          id: personWindowId(personId),
          kind: PERSON_WINDOW_KIND,
          position: { x: FIRST_WINDOW_POSITION.x + offset, y: FIRST_WINDOW_POSITION.y + offset },
        });
      }),
    [connection, manager],
  );

  return (
    <>
      {personWindows.map((window) => (
        <PersonWindow
          key={window.id}
          personId={entityOfWindow(window.id)}
          connection={connection}
          onCenter={onCenter}
        />
      ))}
    </>
  );
}
