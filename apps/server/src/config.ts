export interface ServerConfig {
  port: number;
  databaseUrl: string;
}

const DEFAULT_PORT = 3000;

export function readConfig(env: NodeJS.ProcessEnv): ServerConfig {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set');
  }
  return { port: readPort(env.PORT), databaseUrl };
}

function readPort(value: string | undefined): number {
  if (value === undefined || value === '') {
    return DEFAULT_PORT;
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer between 1 and 65535, got "${value}"`);
  }
  return port;
}
