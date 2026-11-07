import type { CommandHandlers } from '../step';
import { buildFloor } from './build-floor';
import { buildLobby } from './build-lobby';
import { renameUnit } from './rename-unit';

export const towerCommandHandlers: CommandHandlers = {
  buildFloor,
  buildLobby,
  renameUnit,
};
