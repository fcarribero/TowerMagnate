export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

export interface ServerConfig {
  host: string;
  port: number;
  databaseUrl: string;
  logLevel: LogLevel;
  migrateOnStart: boolean;
}

const DEFAULT_HOST = '0.0.0.0';
const DEFAULT_PORT = 3000;
const DEFAULT_LOG_LEVEL: LogLevel = 'info';
const LOG_LEVELS: readonly LogLevel[] = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
];

export function readConfig(env: NodeJS.ProcessEnv): ServerConfig {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set');
  }
  return {
    host: env.HOST || DEFAULT_HOST,
    port: readPort(env.PORT),
    databaseUrl,
    logLevel: readLogLevel(env.LOG_LEVEL),
    migrateOnStart: readMigrateOnStart(env.MIGRATE_ON_START, env.NODE_ENV),
  };
}

function readPort(value: string | undefined): number {
  if (value === undefined || value === '') {
    return DEFAULT_PORT;
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`PORT must be an integer between 0 and 65535, got "${value}"`);
  }
  return port;
}

function readLogLevel(value: string | undefined): LogLevel {
  if (value === undefined || value === '') {
    return DEFAULT_LOG_LEVEL;
  }
  const level = LOG_LEVELS.find((candidate) => candidate === value);
  if (!level) {
    throw new Error(`LOG_LEVEL must be one of ${LOG_LEVELS.join(', ')}, got "${value}"`);
  }
  return level;
}

function readMigrateOnStart(value: string | undefined, nodeEnv: string | undefined): boolean {
  if (value === undefined || value === '') {
    return nodeEnv !== 'production';
  }
  if (value === 'true' || value === 'false') {
    return value === 'true';
  }
  throw new Error(`MIGRATE_ON_START must be true or false, got "${value}"`);
}
