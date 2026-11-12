import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export type LiteralKind = 'color' | 'font-family' | 'pixel-font';

export interface LiteralHit {
  kind: LiteralKind;
  file: string;
  line: number;
  text: string;
}

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.css'];
const PIXEL_FONT_NAMES = [
  'Press Start 2P',
  'Silkscreen',
  'VT323',
  'Pixelify Sans',
  'Pixel Operator',
];

/** The token and font-face files are where literals belong; the tower art is drawn with its own palette. */
const EXCLUDED_FILES = new Set(['ui/tokens.css', 'ui/fonts.css']);
const EXCLUDED_DIRECTORIES = ['render/', 'testing/', 'perfHarness/', 'kitDemo/'];
const GENERATED_SUFFIX = 'Manifest.ts';

const PATTERNS: { kind: LiteralKind; pattern: RegExp }[] = [
  { kind: 'color', pattern: /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/ },
  { kind: 'font-family', pattern: /\bfont-family\s*:|\bfontFamily\b|\bfont\s*=\s*['"`]/ },
  {
    kind: 'pixel-font',
    pattern: new RegExp(PIXEL_FONT_NAMES.join('|'), 'i'),
  },
];

export function isCheckedFile(path: string): boolean {
  const normalized = path.split(sep).join('/');
  if (!SOURCE_EXTENSIONS.some((extension) => normalized.endsWith(extension))) return false;
  if (/\.test\.tsx?$/.test(normalized) || normalized.endsWith(GENERATED_SUFFIX)) return false;
  if (EXCLUDED_FILES.has(normalized)) return false;
  return !EXCLUDED_DIRECTORIES.some((directory) => normalized.startsWith(directory));
}

export function findLiterals(file: string, source: string): LiteralHit[] {
  const hits: LiteralHit[] = [];
  source.split(/\r?\n/).forEach((text, index) => {
    for (const { kind, pattern } of PATTERNS) {
      if (pattern.test(text)) hits.push({ kind, file, line: index + 1, text: text.trim() });
    }
  });
  return hits;
}

function listFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listFiles(join(directory, entry.name)) : [join(directory, entry.name)],
  );
}

export function scanSources(sourceRoot: string): LiteralHit[] {
  return listFiles(sourceRoot)
    .map((path) => relative(sourceRoot, path).split(sep).join('/'))
    .filter(isCheckedFile)
    .sort()
    .flatMap((file) => findLiterals(file, readFileSync(join(sourceRoot, file), 'utf8')));
}

export function formatReport(hits: readonly LiteralHit[], rootLabel: string): string {
  const kinds: LiteralKind[] = ['color', 'font-family', 'pixel-font'];
  const lines = ['Literal report for ' + rootLabel];
  for (const kind of kinds) {
    const ofKind = hits.filter((hit) => hit.kind === kind);
    lines.push('', `${kind}: ${ofKind.length}`);
    for (const hit of ofKind) lines.push(`  ${hit.file}:${hit.line}  ${hit.text}`);
  }
  return lines.join('\n');
}
