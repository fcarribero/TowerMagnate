import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { chromium, type Browser } from '@playwright/test';
import { runCompose, waitForHealthy } from '../support/stack';
import { resolveE2eTarget } from '../support/target';
import { createSweepContext, runScreen } from './context';
import { formatReport, scanSources } from './literals';
import {
  expectedEntries,
  FONT_MODES,
  missingFiles,
  UI_SCALES,
  viewportFor,
  type FontMode,
  type UiScale,
} from './plan';
import { SCREENS } from './screens';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const webSource = join(repoRoot, 'apps/web/src');
const STACK_START_TIMEOUT_MS = 5 * 60_000;
const DEFAULT_PORT_BASE = '4310';

function pick<T extends string | number>(
  all: readonly T[],
  variable: string | undefined,
  parse: (text: string) => T,
): T[] {
  if (!variable) return [...all];
  return variable.split(',').map((text) => parse(text.trim()));
}

function commitName(): string {
  return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: repoRoot }).toString().trim();
}

async function sweepPass(
  browser: Browser,
  baseURL: string,
  scale: UiScale,
  fonts: FontMode,
  outDir: string,
) {
  const browserContext = await browser.newContext({ viewport: viewportFor(scale), baseURL });
  if (fonts === 'nofonts') await browserContext.route('**/*.woff2', (route) => route.abort());
  try {
    const page = await browserContext.newPage();
    const context = createSweepContext({ browserContext, page, scale, fonts, outDir });
    for (const screen of SCREENS) {
      await runScreen(screen.id, () => screen.run(context)).catch(async (error: unknown) => {
        await page
          .screenshot({ path: join(outDir, `failed-${screen.id}-${scale}-${fonts}.png`) })
          .catch(() => undefined);
        throw error;
      });
    }
  } finally {
    await browserContext.close();
  }
}

async function sweep(baseURL: string, scales: UiScale[], modes: FontMode[]): Promise<void> {
  const outDir = process.env.SWEEP_OUT || join(repoRoot, 'ui-sweep-out', commitName());
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const scale of scales) {
      for (const fonts of modes) {
        const started = Date.now();
        await sweepPass(browser, baseURL, scale, fonts, outDir);
        console.log(
          `scale ${scale}, fonts ${fonts}: ${SCREENS.length} screens in ${Math.round((Date.now() - started) / 1000)} s`,
        );
      }
    }
  } finally {
    await browser.close();
  }

  const entries = expectedEntries(SCREENS, scales, modes);
  const missing = missingFiles(entries, readdirSync(outDir));
  if (missing.length > 0) throw new Error(`Missing files: ${missing.join(', ')}`);
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(entries, null, 2) + '\n');
  console.log(`${entries.length} screenshots and manifest.json in ${outDir}`);
}

async function main(): Promise<void> {
  const scales = pick<UiScale>(
    UI_SCALES,
    process.env.SWEEP_SCALES,
    (text) => Number(text) as UiScale,
  );
  const modes = pick<FontMode>(FONT_MODES, process.env.SWEEP_FONTS, (text) => text as FontMode);
  const target = resolveE2eTarget({
    PORT_BASE: DEFAULT_PORT_BASE,
    ...process.env,
    E2E_PROFILE: 'dev',
  });
  if (target.startsStack) {
    await runCompose(['up', '-d', '--build'], target.composeEnv);
  }
  try {
    await waitForHealthy(target.baseUrl, target.startsStack ? STACK_START_TIMEOUT_MS : 30_000);
    await sweep(target.baseUrl, scales, modes);
  } finally {
    if (target.startsStack) await runCompose(['down'], target.composeEnv);
  }
  console.log('\n' + formatReport(scanSources(webSource), 'apps/web/src'));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
