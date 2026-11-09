import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const engineSource = fileURLToPath(new URL('../packages/engine/src', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return name.endsWith('.ts') && !name.endsWith('.test.ts') ? [path] : [];
  });
}

describe('engine news emission', () => {
  it('builds news events only in the emitter', () => {
    const builders = sourceFiles(engineSource).filter((path) =>
      /type:\s*'news'\s*,/.test(readFileSync(path, 'utf8')),
    );
    expect(builders.map((path) => relative(engineSource, path))).toEqual(['news.ts']);
  });
});
