import type { CommandHandlers } from '../step';
import { followPersonCommand, unfollowPersonCommand } from './follow-person';
import { renameUnit } from './rename-unit';

export const towerCommandHandlers: CommandHandlers = {
  renameUnit,
  followPerson: followPersonCommand,
  unfollowPerson: unfollowPersonCommand,
};
