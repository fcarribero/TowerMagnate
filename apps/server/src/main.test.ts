import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestDatabase, type TestDatabase } from './testing/database';

const serverDirectory = fileURLToPath(new URL('..', import.meta.url));

function startServer(databaseUrl: string): { child: ChildProcess; output: () => string } {
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/main.ts'], {
    cwd: serverDirectory,
    env: { ...process.env, DATABASE_URL: databaseUrl, HOST: '127.0.0.1', PORT: '0' },
  });
  let output = '';
  child.stdout?.on('data', (chunk: Buffer) => (output += chunk.toString()));
  child.stderr?.on('data', (chunk: Buffer) => (output += chunk.toString()));
  return { child, output: () => output };
}

async function waitForAddress(output: () => string): Promise<string> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const match = /Server listening at (http:\/\/127\.0\.0\.1:\d+)/.exec(output());
    if (match?.[1]) {
      return match[1];
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server did not start. Output:\n${output()}`);
}

// Windows has no real SIGTERM: kill() ends the process without running handlers.
describe.skipIf(process.platform === 'win32')('server process', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await startTestDatabase();
  });

  afterAll(async () => {
    await database?.stop();
  });

  it('serves /health and closes cleanly on SIGTERM', async () => {
    const { child, output } = startServer(database.url);
    try {
      const address = await waitForAddress(output);

      const response = await fetch(`${address}/health`);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ status: 'ok', version: '0.0.0' });

      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      const [exitCode] = await exited;

      expect(exitCode).toBe(0);
      expect(output()).toContain('Shutting down');
      expect(output()).toContain('Server stopped');
    } finally {
      child.kill('SIGKILL');
    }
  });
});
