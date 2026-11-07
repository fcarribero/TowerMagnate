import type { CommandHandlers } from '../step';
import { renameUnit } from './rename-unit';

export const towerCommandHandlers: CommandHandlers = {
  renameUnit,
};
