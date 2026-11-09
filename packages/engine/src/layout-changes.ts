import type { EngineEvent } from '@tower-magnate/shared';

/** Commands that change the layout: what the transport graph and unit routes are built from. */
const LAYOUT_COMMANDS: ReadonlySet<string> = new Set([
  'buildFloor',
  'buildLobby',
  'buildTransport',
  'buildUnit',
  'buildShaft',
  'resizeShaft',
  'demolish',
  'configureShaft',
]);

export function isLayoutCommand(commandType: string): boolean {
  return LAYOUT_COMMANDS.has(commandType);
}

/** A fire or a bomb turns cells to ruins and can destroy units. */
export function isLayoutEvent(event: EngineEvent): boolean {
  return event.type === 'disaster';
}
