import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deriveStackPorts, readStackProfiles } from './stack-env';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const envFile = fileURLToPath(new URL('../.env', import.meta.url));

if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const env = {
  ...process.env,
  ...deriveStackPorts(process.env),
  COMPOSE_PROFILES: readStackProfiles(process.env),
};
const composeArgs = ['compose', ...process.argv.slice(2)];

const docker = spawn('docker', composeArgs, { cwd: repoRoot, env, stdio: 'inherit' });
docker.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
