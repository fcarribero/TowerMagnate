import { serverMessage, type CommandResult } from '@tower-magnate/shared';
import { sendError, sendMessage, type DebugFrames } from '../gateway';
import type { TowerRunner, TowerChange } from '../runner';
import { fastForward, forceEvent, loadScenario, setClock, setMoney, DebugRefusal } from './changes';
import { debugTypeOf, DebugMessageSchema, type DebugMessage } from './messages';

export interface DebugFramesOptions {
  runner: TowerRunner;
  /** False in production: every debug message is answered with NOT_ALLOWED and does nothing. */
  enabled: boolean;
}

function changeOf(message: DebugMessage): TowerChange {
  switch (message.t) {
    case 'debug.forceEvent':
      return forceEvent(message.p.kind, message.p.unitId);
    case 'debug.fastForward':
      return fastForward(message.p.steps);
    case 'debug.setClock':
      return setClock(message.p);
    case 'debug.setMoney':
      return setMoney(message.p.amount);
    case 'debug.loadScenario':
      return loadScenario(message.p.name);
  }
}

function parseFrame(rawData: unknown): DebugMessage | null {
  const result = DebugMessageSchema.safeParse(JSON.parse(String(rawData)));
  return result.success ? result.data : null;
}

export function createDebugFrames({ runner, enabled }: DebugFramesOptions): DebugFrames {
  return {
    typeOf: debugTypeOf,
    async handle(rawData, { socket, identity }) {
      if (!enabled) {
        sendError(socket, 'NOT_ALLOWED', 'Debug commands are not available here');
        return;
      }
      const message = parseFrame(rawData);
      if (!message) {
        sendError(socket, 'INVALID_COMMAND', 'Not a valid debug message');
        return;
      }
      const { id } = message.p;
      let result: CommandResult;
      try {
        await runner.change(identity.towerId, changeOf(message));
        const step = runner.stateOf(identity.towerId)?.step ?? 0;
        result = { id, ok: true, step, cost: 0, refund: 0 };
      } catch (error) {
        if (!(error instanceof DebugRefusal)) {
          throw error;
        }
        const step = runner.stateOf(identity.towerId)?.step ?? 0;
        result = { id, ok: false, step, error: error.code };
      }
      sendMessage(socket, serverMessage('commandResult', result));
    },
  };
}
