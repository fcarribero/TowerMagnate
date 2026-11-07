import { readFile } from 'node:fs/promises';

export const API_KEY_NAME = 'ELEVENLABS_API_KEY';

export function readKeyFromEnvFile(content: string): string | undefined {
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (match && match[1] === API_KEY_NAME) {
      const value = stripQuotes((match[2] ?? '').trim());
      return value === '' ? undefined : value;
    }
  }
  return undefined;
}

function stripQuotes(value: string): string {
  const quoted = /^(["'])(.*)\1$/.exec(value);
  return quoted?.[2] ?? value;
}

export async function findApiKey(env: NodeJS.ProcessEnv, envFiles: string[]): Promise<string> {
  const fromEnv = env[API_KEY_NAME]?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  for (const file of envFiles) {
    const content = await readFileIfPresent(file);
    const key = content === undefined ? undefined : readKeyFromEnvFile(content);
    if (key) {
      return key;
    }
  }
  throw new Error(
    `${API_KEY_NAME} not found. Set it in the environment or in one of: ${envFiles.join(', ')}`,
  );
}

async function readFileIfPresent(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}
