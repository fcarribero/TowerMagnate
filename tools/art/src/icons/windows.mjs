import { PixelCanvas } from '../canvas.mjs';
import { ICON_SIZE } from './legend.mjs';

const INK = 'obra-ink';

// A filled rectangle with a 1 px ink stroke; neighbouring boxes share strokes.
function box(canvas, left, top, width, height, fill) {
  canvas.fillRect(left, top, width, height, INK);
  canvas.fillRect(left + 1, top + 1, width - 2, height - 2, fill);
}

function icon() {
  return new PixelCanvas(ICON_SIZE, ICON_SIZE);
}

function map() {
  const canvas = icon();
  box(canvas, 1, 2, 5, 12, 'obra-green');
  box(canvas, 5, 2, 6, 12, 'obra-paper');
  box(canvas, 10, 2, 5, 12, 'obra-yellow');
  box(canvas, 6, 4, 4, 4, 'obra-red');
  return canvas;
}

function finances() {
  const canvas = icon();
  canvas.vline(0, 0, 15, INK);
  canvas.vline(1, 0, 15, INK);
  canvas.hline(0, 14, 16, INK);
  canvas.hline(0, 15, 16, INK);
  box(canvas, 3, 8, 4, 7, 'obra-yellow');
  box(canvas, 7, 5, 4, 10, 'obra-green');
  box(canvas, 11, 1, 4, 14, 'obra-paper');
  return canvas;
}

function followed() {
  const canvas = icon();
  box(canvas, 3, 1, 6, 6, 'obra-paper');
  box(canvas, 1, 6, 10, 9, 'obra-blue');
  canvas.vline(13, 1, 10, INK);
  canvas.vline(14, 1, 10, INK);
  box(canvas, 9, 1, 6, 4, 'obra-red');
  return canvas;
}

function news() {
  const canvas = icon();
  box(canvas, 1, 2, 14, 12, 'obra-paper');
  box(canvas, 3, 4, 5, 5, 'obra-yellow');
  canvas.fillRect(9, 4, 4, 2, INK);
  canvas.fillRect(9, 7, 4, 1, INK);
  canvas.fillRect(3, 10, 10, 1, INK);
  return canvas;
}

function alarm() {
  const canvas = icon();
  canvas.set(2, 1, INK);
  canvas.set(3, 2, INK);
  canvas.set(13, 1, INK);
  canvas.set(12, 2, INK);
  canvas.fillRect(7, 0, 2, 3, INK);
  box(canvas, 4, 3, 8, 7, 'obra-red');
  canvas.fillRect(5, 4, 2, 3, 'obra-paper');
  box(canvas, 2, 9, 12, 4, 'obra-yellow');
  canvas.fillRect(1, 13, 14, 2, INK);
  return canvas;
}

// 8 x 8 badge: a yellow lock on an ink square.
function lock() {
  const canvas = new PixelCanvas(8, 8);
  canvas.fillRect(0, 0, 8, 8, INK);
  canvas.fillRect(2, 1, 4, 1, 'obra-yellow');
  canvas.vline(2, 2, 2, 'obra-yellow');
  canvas.vline(5, 2, 2, 'obra-yellow');
  canvas.fillRect(1, 4, 6, 3, 'obra-yellow');
  canvas.set(3, 5, INK);
  canvas.set(4, 5, INK);
  return canvas;
}

const WEATHER_LEGEND = {
  k: 'obra-ink',
  y: 'obra-yellow',
  p: 'obra-paper',
  b: 'obra-blue',
  s: 'obra-paper-shade',
};

function fromMap(rows) {
  const canvas = icon();
  canvas.drawMap(0, 0, rows, WEATHER_LEGEND);
  return canvas;
}

// Weather icons for the top bar: a sun, a cloud, a cloud with rain and a moon.
const WEATHER_SUN = [
  '.......kk.......',
  '.......kk.......',
  '..kk...kk...kk..',
  '...kk.kkkk.kk...',
  '....kkyyyykk....',
  '.....kyyyyk.....',
  '.kk.kyyyyyyk.kk.',
  '.kk.kyyyyyyk.kk.',
  '.....kyyyyk.....',
  '....kkyyyykk....',
  '...kk.kkkk.kk...',
  '..kk...kk...kk..',
  '.......kk.......',
  '.......kk.......',
  '................',
  '................',
];

const WEATHER_CLOUD = [
  '................',
  '................',
  '.......kkkk.....',
  '.....kkppppkk...',
  '....kpppppppkk..',
  '..kkkpppppppppk.',
  '.kpppppppppppppk',
  '.kpppppppppppppk',
  '.kpppppppppppppk',
  '.kssssssssssssk.',
  '..kkkkkkkkkkkk..',
  '................',
  '................',
  '................',
  '................',
  '................',
];

const WEATHER_RAIN = [
  '................',
  '.......kkkk.....',
  '.....kkppppkk...',
  '....kpppppppkk..',
  '..kkkpppppppppk.',
  '.kpppppppppppppk',
  '.kssssssssssssk.',
  '..kkkkkkkkkkkk..',
  '................',
  '..bb...bb...bb..',
  '..bb...bb...bb..',
  '.bb...bb...bb...',
  '.bb...bb...bb...',
  '................',
  '................',
  '................',
];

const WEATHER_MOON = [
  '................',
  '.....kkkk.......',
  '....kyyykk......',
  '...kyyyk........',
  '..kyyyk.........',
  '..kyyyk.........',
  '..kyyyk.........',
  '..kyyyk.........',
  '..kyyyyk......k.',
  '...kyyyykk..kkk.',
  '....kyyyyyyykk..',
  '.....kkyyyykk...',
  '.......kkkk.....',
  '................',
  '................',
  '................',
];

export function windowAndAlertIcons() {
  return [
    { id: 'ui/window-map', canvas: map() },
    { id: 'ui/window-finances', canvas: finances() },
    { id: 'ui/window-followed', canvas: followed() },
    { id: 'ui/window-news', canvas: news() },
    { id: 'ui/alarm', canvas: alarm() },
    { id: 'ui/lock', canvas: lock() },
    { id: 'ui/weather-sun', canvas: fromMap(WEATHER_SUN) },
    { id: 'ui/weather-cloud', canvas: fromMap(WEATHER_CLOUD) },
    { id: 'ui/weather-rain', canvas: fromMap(WEATHER_RAIN) },
    { id: 'ui/weather-moon', canvas: fromMap(WEATHER_MOON) },
  ];
}
