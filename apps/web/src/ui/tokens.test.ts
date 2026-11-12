import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const tokensCss = readFileSync(join(__dirname, 'tokens.css'), 'utf8');
const fontsCss = readFileSync(join(__dirname, 'fonts.css'), 'utf8');

const TOKEN_IDS = [
  'obra.ink',
  'obra.paper',
  'obra.paper-shade',
  'obra.field',
  'obra.yellow',
  'obra.red',
  'obra.blue',
  'obra.green',
  'obra.muted',
  'obra.rule',
  'obra.scrim',
  'border.control',
  'border.window',
  'border.dialog',
  'shadow.control',
  'shadow.window',
  'shadow.dialog',
  'space.1',
  'space.2',
  'space.3',
  'space.4',
  'size.hazard-stripe',
  'size.lock-stripe',
  'size.press-offset',
];

const TEXT_STYLE_IDS = [
  'status-value',
  'status-label',
  'news',
  'window-title',
  'window-subtitle',
  'dialog-title',
  'body',
  'body-strong',
  'button',
  'tile-label',
  'price',
  'number-large',
];

function propertyName(id: string): string {
  return `--${id.replaceAll('.', '-')}`;
}

function definitionsOf(name: string): number {
  return tokensCss.split(`${name}:`).length - 1;
}

describe('style tokens', () => {
  it.each(TOKEN_IDS)('defines %s once', (id) => {
    expect(definitionsOf(propertyName(id))).toBe(1);
  });

  it.each(TEXT_STYLE_IDS)('defines the text style %s once', (id) => {
    expect(definitionsOf(`--text-${id}`)).toBe(1);
  });

  it('has no text style smaller than 8 UI pixels', () => {
    const sizes = [...tokensCss.matchAll(/--text-[\w-]+: \d+ calc\((\d+) \*/g)].map((m) =>
      Number(m[1]),
    );
    expect(sizes).toHaveLength(TEXT_STYLE_IDS.length);
    expect(Math.min(...sizes)).toBe(8);
  });
});

describe('fonts', () => {
  it('loads each face from a file in the repo with font-display swap', () => {
    const faces = fontsCss.match(/@font-face/g) ?? [];
    const swaps = fontsCss.match(/font-display: swap/g) ?? [];
    expect(faces).toHaveLength(4);
    expect(swaps).toHaveLength(4);
    expect(fontsCss).not.toMatch(/https?:/);
  });

  it('lists the fallbacks', () => {
    expect(tokensCss).toContain("'Archivo Black', Impact, sans-serif");
    expect(tokensCss).toContain("'Space Grotesk', system-ui, sans-serif");
    expect(tokensCss).toContain("'IBM Plex Mono', ui-monospace, monospace");
  });
});
