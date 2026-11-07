import type { CommandHandlers } from '../step';
import { buildFloor } from './build-floor';
import { buildLobby } from './build-lobby';
import { buildShaft, resizeShaft } from './build-shaft';
import { buildUnit } from './build-unit';
import { addCar, removeCar } from './elevator-cars';
import { followPersonCommand, unfollowPersonCommand } from './follow-person';
import { renameUnit } from './rename-unit';

export const towerCommandHandlers: CommandHandlers = {
  buildFloor,
  buildLobby,
  buildUnit,
  buildShaft,
  resizeShaft,
  addCar,
  removeCar,
  renameUnit,
  followPerson: followPersonCommand,
  unfollowPerson: unfollowPersonCommand,
};
