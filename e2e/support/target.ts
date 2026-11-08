import { deriveStackPorts } from '../../scripts/stack-env';

export const E2E_PROJECT_NAME = 'tm-e2e';
export const E2E_PORT_BASE = '4300';

export interface E2eTarget {
  baseUrl: string;
  startsStack: boolean;
  composeEnv: Record<string, string>;
}

export function resolveE2eTarget(env: NodeJS.ProcessEnv): E2eTarget {
  if (env.BASE_URL) {
    return { baseUrl: env.BASE_URL.replace(/\/+$/, ''), startsStack: false, composeEnv: {} };
  }
  const ports = deriveStackPorts({ ...env, PORT_BASE: env.PORT_BASE || E2E_PORT_BASE });
  const profile = env.E2E_PROFILE === 'prod' ? 'prod' : 'dev';
  // The production app serves the web build itself, so the game is on the server port.
  const gamePort = profile === 'prod' ? ports.SERVER_PORT : ports.WEB_PORT;
  return {
    baseUrl: `http://localhost:${gamePort}`,
    startsStack: true,
    composeEnv: {
      COMPOSE_PROJECT_NAME: env.COMPOSE_PROJECT_NAME || E2E_PROJECT_NAME,
      COMPOSE_PROFILES: profile,
      ...ports,
    },
  };
}
