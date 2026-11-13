import { useEffect, useRef } from 'preact/hooks';
import type { InspectTarget } from '@tower-magnate/shared';
import type { GameConnection } from '../../net/gameConnection';
import { useWindowManager } from '../kit';
import {
  UNIT_WINDOW_KIND,
  entityOfWindow,
  diffInspectTargets,
  inspectTargetKey,
  openInspectTargets,
  unitWindowId,
} from '../inspectTarget';
import { UnitWindow } from './UnitWindow';

const FIRST_WINDOW_POSITION = { x: 40, y: 40 };
const CASCADE_STEP = 12;

interface UnitWindowsProps {
  connection: GameConnection;
}

/**
 * Opens a unit window whenever the Lupa asks for one, and keeps the server
 * inspecting every open unit and elevator window.
 */
export function UnitWindows({ connection }: UnitWindowsProps) {
  const manager = useWindowManager();
  const unitWindows = manager.stack.windows.filter((window) => window.kind === UNIT_WINDOW_KIND);
  const targets = openInspectTargets(manager.stack.windows);
  const targetKeys = targets.map(inspectTargetKey).join(',');
  const sentTargets = useRef<InspectTarget[]>([]);

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
    const { added, removed } = diffInspectTargets(sentTargets.current, targets);
    removed.forEach((target) => connection.commands.inspectRemove(target));
    added.forEach((target) => connection.commands.inspectAdd(target));
    sentTargets.current = targets;
  }, [connection, targetKeys]);

  return (
    <>
      {unitWindows.map((window) => (
        <UnitWindow key={window.id} unitId={entityOfWindow(window.id)} connection={connection} />
      ))}
    </>
  );
}
