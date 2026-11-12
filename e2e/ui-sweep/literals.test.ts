import { describe, expect, it } from 'vitest';
import { findLiterals, formatReport, isCheckedFile } from './literals';

describe('ui sweep literal report', () => {
  it('finds colors, font families and pixel fonts with their line', () => {
    const source = [
      '.a {',
      '  color: #fff;',
      '  background: rgb(1, 2, 3);',
      "  font-family: 'Press Start 2P';",
      '}',
    ].join('\n');
    const hits = findLiterals('ui/a.css', source);
    expect(hits.map((hit) => [hit.kind, hit.line])).toEqual([
      ['color', 2],
      ['color', 3],
      ['font-family', 4],
      ['pixel-font', 4],
    ]);
  });

  it('ignores token references', () => {
    expect(findLiterals('ui/a.css', 'color: var(--tm-text);')).toEqual([]);
  });

  it('skips tests, token files and the tower art', () => {
    expect(isCheckedFile('ui/kit/kit.css')).toBe(true);
    expect(isCheckedFile('ui/tokens.css')).toBe(false);
    expect(isCheckedFile('ui/a.test.tsx')).toBe(false);
    expect(isCheckedFile('render/stage.ts')).toBe(false);
    expect(isCheckedFile('assets/fonts/a.woff2')).toBe(false);
  });

  it('prints a count per kind', () => {
    const report = formatReport(findLiterals('ui/a.css', 'color: #fff;'), 'src');
    expect(report).toContain('color: 1');
    expect(report).toContain('font-family: 0');
    expect(report).toContain('  ui/a.css:1  color: #fff;');
  });
});
