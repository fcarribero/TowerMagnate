import { drawIcon } from './legend.mjs';

const INSPECT = [
  '................',
  '....kkkkk.......',
  '...kqqqqqk......',
  '..kqwwqaaqk.....',
  '..kqwqaaaak.....',
  '..kqqaaaaak.....',
  '..kqaaaaaak.....',
  '...kaaaaak......',
  '....kkkkkk......',
  '.......kNnk.....',
  '........kNnk....',
  '.........kNnk...',
  '..........kNnk..',
  '...........kkk..',
  '................',
  '................',
];

const BULLDOZER = [
  '................',
  '................',
  '......kkkkk.....',
  '.....kyyyyyk....',
  '.....kyaaayk....',
  'kk...kyaaayk....',
  'kdk..kyaaayk....',
  'kdkkkkyyyyyykk..',
  'kdkyyyyyyyyyyk..',
  'kdkyyyyyyyyyyk..',
  'kdkkkkkkkkkkkk..',
  '.kkhhhhhhhhhhk..',
  '.khsgsgsgsgsgk..',
  '.khhhhhhhhhhhk..',
  '..kkkkkkkkkkk...',
  '................',
];

const CAR = [
  '................',
  '....kkkkkkkk....',
  '....kyyyyyyk....',
  '...kkkkkkkkkk...',
  '...kcsssssssck..',
  '...kcswwkwwsck..',
  '...kcswwkwwsck..',
  '...kcswwkwwsck..',
  '...kcswwkwwsck..',
  '...kcswwkwwsck..',
  '...kcsssssssck..',
  '...kkkkkkkkkkk..',
  '................',
  '................',
  '................',
  '................',
];

export function toolIcons() {
  return [
    drawIcon('ui/tool-inspect', INSPECT),
    drawIcon('ui/tool-bulldozer', BULLDOZER),
    drawIcon('ui/tool-car', CAR),
  ];
}
