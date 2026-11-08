import { deriveStackPorts } from '../../scripts/stack-env';

export const E2E_PROJECT_NAME = 'tm-e2e';
export const E2E_PORT_BASE = '4300';
/** The stack's register and login limit; many specs register a fresh player within a minute. */
export const E2E_AUTH_ATTEMPTS_PER_MINUTE = '1000';
/** Tag for specs that drive the server with debug socket messages, which production turns off. */
export const DEBUG_TAG = '@debug';

export interface E2eTarget {
  baseUrl: string;
  startsStack: boolean;
  debugCommands: boolean;
  composeEnv: Record<string, string>;
}

export function resolveE2eTarget(env: NodeJS.ProcessEnv): E2eTarget {
  const profile = env.E2E_PROFILE === 'prod' ? 'prod' : 'dev';
  const debugCommands = profile === 'dev';
  if (env.BASE_URL) {
    return {
      baseUrl: env.BASE_URL.replace(/\/+$/, ''),
      startsStack: false,
      debugCommands,
      composeEnv: {},
    };
  }
  const ports = deriveStackPorts({ ...env, PORT_BASE: env.PORT_BASE || E2E_PORT_BASE });
  // The production app serves the web build itself, so the game is on the server port.
  const gamePort = profile === 'prod' ? ports.SERVER_PORT : ports.WEB_PORT;
  return {
    baseUrl: `http://localhost:${gamePort}`,
    startsStack: true,
    debugCommands,
    composeEnv: {
      COMPOSE_PROJECT_NAME: env.COMPOSE_PROJECT_NAME || E2E_PROJECT_NAME,
      COMPOSE_PROFILES: profile,
      AUTH_ATTEMPTS_PER_MINUTE: E2E_AUTH_ATTEMPTS_PER_MINUTE,
      ...ports,
    },
  };
}
