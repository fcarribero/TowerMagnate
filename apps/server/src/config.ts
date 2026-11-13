export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

export interface ServerConfig {
  host: string;
  port: number;
  databaseUrl: string;
  logLevel: LogLevel;
  migrateOnStart: boolean;
  /** Set in production, where the server also serves the built web client. */
  webDir?: string;
  secureCookies: boolean;
  /** Web origins allowed to send state-changing API requests. */
  allowedOrigins: string[];
  /** Dev-only debug socket messages. Never on when NODE_ENV is production. */
  debugCommands: boolean;
  /** Usernames that get the developer menu. Empty when debug commands are off. */
  developerUsernames: string[];
  /** Login and register attempts per client and minute. Unset keeps the server default. */
  authAttemptsPerMinute?: number;
}

const DEFAULT_HOST = '0.0.0.0';
const DEFAULT_PORT = 3000;
const DEV_WEB_ORIGIN = 'http://localhost:5173';
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
    webDir: env.WEB_DIR || undefined,
    secureCookies: readSecureCookies(env.SECURE_COOKIES, env.NODE_ENV),
    allowedOrigins: readAllowedOrigins(env.ALLOWED_ORIGINS, env.NODE_ENV),
    debugCommands: env.NODE_ENV !== 'production',
    developerUsernames:
      env.NODE_ENV === 'production' ? [] : readList(env.DEVELOPER_USERNAMES),
    authAttemptsPerMinute: readAuthAttemptsPerMinute(env.AUTH_ATTEMPTS_PER_MINUTE),
  };
}

function readList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name !== '');
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

function readAuthAttemptsPerMinute(value: string | undefined): number | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }
  const attempts = Number(value);
  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new Error(`AUTH_ATTEMPTS_PER_MINUTE must be a positive integer, got "${value}"`);
  }
  return attempts;
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
  return readBoolean('MIGRATE_ON_START', value, nodeEnv !== 'production');
}

function readSecureCookies(value: string | undefined, nodeEnv: string | undefined): boolean {
  return readBoolean('SECURE_COOKIES', value, nodeEnv === 'production');
}

function readAllowedOrigins(value: string | undefined, nodeEnv: string | undefined): string[] {
  if (value === undefined || value === '') {
    return nodeEnv === 'production' ? [] : [DEV_WEB_ORIGIN];
  }
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin !== '');
}

function readBoolean(name: string, value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') {
    return fallback;
  }
  if (value === 'true' || value === 'false') {
    return value === 'true';
  }
  throw new Error(`${name} must be true or false, got "${value}"`);
}
