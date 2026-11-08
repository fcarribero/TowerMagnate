import { PROTOCOL_VERSION, serverMessage } from '@tower-magnate/shared';
import { CLOSE_CODES, sendError, sendMessage, type MessageHandlers } from '../gateway';
import type { TowerRunner } from '../runner';
import { buildSnapshot } from './snapshot';
import type { Viewports } from './viewports';

export interface TowerSocketDependencies {
  runner: TowerRunner;
  viewports: Viewports;
}

/**
 * `hello` joins the socket to its tower and answers with a snapshot; a second `hello` on the
 * same socket asks for a fresh one. Deltas and commands come in later tasks.
 */
export function towerSocketHandlers({
  runner,
  viewports,
}: TowerSocketDependencies): MessageHandlers {
  return {
    hello: async (message, { socket, identity, join }) => {
      if (message.v !== PROTOCOL_VERSION || message.p.protocol !== PROTOCOL_VERSION) {
        sendError(socket, 'PROTOCOL_MISMATCH', `The server speaks protocol ${PROTOCOL_VERSION}`);
        socket.close(CLOSE_CODES.protocolMismatch, 'Protocol mismatch');
        return;
      }
      join();
      await runner.resume(identity.towerId);
      const state = runner.stateOf(identity.towerId);
      if (state) {
        sendMessage(socket, serverMessage('snapshot', buildSnapshot(state, viewports.get(socket))));
      }
    },
    viewport: (message, { socket }) => {
      viewports.update(socket, message.p);
    },
    ping: (message, { socket, identity }) => {
      const serverStep = runner.stateOf(identity.towerId)?.step ?? 0;
      sendMessage(socket, serverMessage('pong', { clientTime: message.p.clientTime, serverStep }));
    },
  };
}
