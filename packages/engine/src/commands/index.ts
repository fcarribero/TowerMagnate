import type { CommandHandlers } from '../step';
import { answerEvent } from './answer-event';
import { buildFloor } from './build-floor';
import { buildLobby } from './build-lobby';
import { buildTransport } from './build-transport';
import { buildUnit } from './build-unit';
import { followPersonCommand, unfollowPersonCommand } from './follow-person';
import { renameUnit } from './rename-unit';

export const towerCommandHandlers: CommandHandlers = {
  answerEvent,
  buildFloor,
  buildLobby,
  buildTransport,
  buildUnit,
  renameUnit,
  followPerson: followPersonCommand,
  unfollowPerson: unfollowPersonCommand,
};
