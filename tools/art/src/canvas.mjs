import { colorIndex, colorRgba, colors } from './palette.mjs';

const CLEAR = 0;

function toIndex(color) {
  if (typeof color === 'string') {
    return colorIndex(color);
  }
  if (!Number.isInteger(color) || color < 0 || color >= colors.length) {
    throw new Error(`Not a palette color: ${color}`);
  }
  return color;
}

// A sprite drawn with palette indices, so it can never use an off-palette color.
export class PixelCanvas {
  constructor(width, height) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
      throw new Error(`Invalid canvas size ${width}x${height}`);
    }
    this.width = width;
    this.height = height;
    this.pixels = new Uint8Array(width * height);
  }

  contains(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  set(x, y, color) {
    if (this.contains(x, y)) {
      this.pixels[y * this.width + x] = toIndex(color);
    }
  }

  get(x, y) {
    if (!this.contains(x, y)) {
      return CLEAR;
    }
    return this.pixels[y * this.width + x];
  }

  fillRect(left, top, width, height, color) {
    const index = toIndex(color);
    for (let y = top; y < top + height; y++) {
      for (let x = left; x < left + width; x++) {
        this.set(x, y, index);
      }
    }
  }

  hline(left, y, length, color) {
    this.fillRect(left, y, length, 1, color);
  }

  vline(x, top, length, color) {
    this.fillRect(x, top, 1, length, color);
  }

  strokeRect(left, top, width, height, color) {
    this.hline(left, top, width, color);
    this.hline(left, top + height - 1, width, color);
    this.vline(left, top, height, color);
    this.vline(left + width - 1, top, height, color);
  }

  // Draws a small pixel map. Each character in `rows` is looked up in `legend`
  // (character to color id); '.' and characters missing from the legend are skipped.
  drawMap(left, top, rows, legend) {
    rows.forEach((row, rowIndex) => {
      [...row].forEach((character, columnIndex) => {
        const color = legend[character];
        if (character !== '.' && color !== undefined) {
          this.set(left + columnIndex, top + rowIndex, color);
        }
      });
    });
  }

  // Copies another canvas on top of this one; clear pixels in the source are skipped.
  stamp(source, left, top) {
    for (let y = 0; y < source.height; y++) {
      for (let x = 0; x < source.width; x++) {
        const index = source.get(x, y);
        if (index !== CLEAR) {
          this.set(left + x, top + y, index);
        }
      }
    }
  }

  // Returns a copy with colors swapped, for example { 'cloth-blue': 'stress-pink' }.
  recolor(replacements) {
    const indexMap = new Map(
      Object.entries(replacements).map(([from, to]) => [toIndex(from), toIndex(to)]),
    );
    const copy = this.clone();
    copy.pixels = copy.pixels.map((index) => indexMap.get(index) ?? index);
    return copy;
  }

  clone() {
    const copy = new PixelCanvas(this.width, this.height);
    copy.pixels.set(this.pixels);
    return copy;
  }

  toRgba() {
    const rgba = new Uint8Array(this.width * this.height * 4);
    this.pixels.forEach((index, pixel) => {
      rgba.set(colorRgba(index), pixel * 4);
    });
    return rgba;
  }
}
