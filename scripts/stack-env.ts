export const DEFAULT_PORT_BASE = 4100;

export interface StackPorts {
  POSTGRES_PORT: string;
  SERVER_PORT: string;
  WEB_PORT: string;
}

export function deriveStackPorts(env: NodeJS.ProcessEnv): StackPorts {
  const base = readPortBase(env.PORT_BASE);
  return {
    POSTGRES_PORT: env.POSTGRES_PORT || String(base),
    SERVER_PORT: env.SERVER_PORT || String(base + 1),
    WEB_PORT: env.WEB_PORT || String(base + 2),
  };
}

function readPortBase(value: string | undefined): number {
  if (value === undefined || value === '') {
    return DEFAULT_PORT_BASE;
  }
  const base = Number(value);
  if (!Number.isInteger(base) || base < 1 || base > 65533) {
    throw new Error(`PORT_BASE must be an integer between 1 and 65533, got "${value}"`);
  }
  return base;
}
