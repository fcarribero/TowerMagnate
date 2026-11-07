import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const eslint = new ESLint({ cwd: repoRoot });

async function ruleIdsFor(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages.map((message) => message.ruleId ?? 'fatal') ?? [];
}

describe('engine purity lint rules', () => {
  const engineFile = 'packages/engine/src/sample.ts';

  it('rejects Math.random in the engine', async () => {
    const ruleIds = await ruleIdsFor('export const roll = Math.random();\n', engineFile);
    expect(ruleIds).toContain('no-restricted-properties');
  });

  it('rejects Date.now in the engine', async () => {
    const ruleIds = await ruleIdsFor('export const now = Date.now();\n', engineFile);
    expect(ruleIds).toContain('no-restricted-properties');
  });

  it('rejects the Date constructor in the engine', async () => {
    const ruleIds = await ruleIdsFor('export const today = new Date();\n', engineFile);
    expect(ruleIds).toContain('no-restricted-globals');
  });

  it('allows Math.random outside the engine', async () => {
    const ruleIds = await ruleIdsFor(
      'export const roll = Math.random();\n',
      'apps/server/src/sample.ts',
    );
    expect(ruleIds).toEqual([]);
  });
});
