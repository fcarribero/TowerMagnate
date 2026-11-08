import { drawIcon } from './legend.mjs';

const STAR_FULL = [
  '................',
  '.......kk.......',
  '.......kyk......',
  '......kYyyk.....',
  '......kYyyk.....',
  '.kkkkkkYyyykkkk.',
  '.kYyyyyyyyyyyyk.',
  '..kYyyyyyyyyyk..',
  '...kyyyyyyyyk...',
  '....kyyyyyyk....',
  '....kyyyyyyk....',
  '...kyyykkyyyk...',
  '...kyykk.kyyk...',
  '..kykk.....kyk..',
  '..kk.......kkk..',
  '................',
];

const STAR_EMPTY = [
  '................',
  '.......dd.......',
  '.......dd.......',
  '......d..d......',
  '......d..d......',
  '.dddddd..dddddd.',
  '.d............d.',
  '..d..........d..',
  '...d........d...',
  '....d......d....',
  '....d......d....',
  '...d..dddd..d...',
  '...d.dd..dd.d...',
  '..dddd....dddd..',
  '................',
  '................',
];

const MONEY = [
  '................',
  '................',
  '.kkkkkkkkkkkkkk.',
  '.kEeeeeeeeeeeEk.',
  '.keeeeewweeeeek.',
  '.keeeewEEweeeek.',
  '.keeeewEEweeeek.',
  '.keeeeewweeeeek.',
  '.kEeeeeeeeeeeEk.',
  '.kkkkkkkkkkkkkk.',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
];

const POPULATION = [
  '................',
  '......kkkk......',
  '.....kTTTTk.....',
  '.....kTkTkk.....',
  '.....kTTTTk.....',
  '......kkkk......',
  '....kkbbbbkk....',
  '...kbbbbbbbbk...',
  '..kbbbbbbbbbbk..',
  '..kbbbbbbbbbbk..',
  '..kbbbbbbbbbbk..',
  '..kbbbbbbbbbbk..',
  '..kkkkkkkkkkkk..',
  '................',
  '................',
  '................',
];

export function statusIcons() {
  return [
    drawIcon('ui/star-full', STAR_FULL),
    drawIcon('ui/star-empty', STAR_EMPTY),
    drawIcon('ui/money', MONEY),
    drawIcon('ui/population', POPULATION),
  ];
}
