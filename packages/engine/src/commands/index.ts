import type { CommandHandlers } from '../step';
import { answerEvent } from './answer-event';
import { buildFloor } from './build-floor';
import { buildLobby } from './build-lobby';
import { renameUnit } from './rename-unit';

export const towerCommandHandlers: CommandHandlers = {
  answerEvent,
  buildFloor,
  buildLobby,
  renameUnit,
};
