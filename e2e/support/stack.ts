import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export function runCompose(args: string[], composeEnv: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['compose', ...args], {
      cwd: repoRoot,
      env: { ...process.env, ...composeEnv },
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`docker compose ${args.join(' ')} exited with code ${code}`));
      }
    });
  });
}

export type RestartMode = 'graceful' | 'hard';

/** Restarts the game server container: SIGTERM and start again, or SIGKILL and start again. */
export async function restartServer(
  composeEnv: Record<string, string>,
  mode: RestartMode,
): Promise<void> {
  const service = composeEnv.COMPOSE_PROFILES === 'prod' ? 'app' : 'server';
  if (mode === 'graceful') {
    await runCompose(['restart', service], composeEnv);
    return;
  }
  await runCompose(['kill', '--signal', 'SIGKILL', service], composeEnv);
  await runCompose(['start', service], composeEnv);
}

export async function waitForHealthy(baseUrl: string, timeoutMs: number): Promise<void> {
  const healthUrl = `${baseUrl}/api/health`;
  const deadline = Date.now() + timeoutMs;
  let lastProblem = 'no answer yet';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(healthUrl);
      if (response.ok) {
        return;
      }
      lastProblem = `status ${response.status}`;
    } catch (error) {
      lastProblem = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`${healthUrl} was not healthy after ${timeoutMs} ms (${lastProblem})`);
}
