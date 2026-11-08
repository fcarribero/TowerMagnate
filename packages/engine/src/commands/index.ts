import type { CommandHandlers } from '../step';
import { answerEvent } from './answer-event';
import { buildFloor } from './build-floor';
import { buildLobby } from './build-lobby';
import { buildTransport } from './build-transport';
import { buildShaft, resizeShaft } from './build-shaft';
import { buildUnit } from './build-unit';
import { addCar, removeCar } from './elevator-cars';
import { followPersonCommand, unfollowPersonCommand } from './follow-person';
import { renameUnit } from './rename-unit';
import { setPrice } from './set-price';

export const towerCommandHandlers: CommandHandlers = {
  answerEvent,
  buildFloor,
  buildLobby,
  buildTransport,
  buildUnit,
  buildShaft,
  resizeShaft,
  addCar,
  removeCar,
  renameUnit,
  setPrice,
  followPerson: followPersonCommand,
  unfollowPerson: unfollowPersonCommand,
};
