import type { CommandHandlers } from '../step';
import { buildFloor } from './build-floor';
import { buildLobby } from './build-lobby';
import { buildUnit } from './build-unit';
import { followPersonCommand, unfollowPersonCommand } from './follow-person';
import { renameUnit } from './rename-unit';

export const towerCommandHandlers: CommandHandlers = {
  buildFloor,
  buildLobby,
  buildUnit,
  renameUnit,
  followPerson: followPersonCommand,
  unfollowPerson: unfollowPersonCommand,
};
