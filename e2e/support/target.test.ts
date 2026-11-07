import { describe, expect, it } from 'vitest';
import { resolveE2eTarget } from './target';

describe('resolveE2eTarget', () => {
  it('uses a running stack when BASE_URL is set', () => {
    expect(resolveE2eTarget({ BASE_URL: 'http://localhost:4132/' })).toEqual({
      baseUrl: 'http://localhost:4132',
      startsStack: false,
      composeEnv: {},
    });
  });

  it('starts its own stack on the e2e port block by default', () => {
    expect(resolveE2eTarget({})).toEqual({
      baseUrl: 'http://localhost:4302',
      startsStack: true,
      composeEnv: {
        COMPOSE_PROJECT_NAME: 'tm-e2e',
        POSTGRES_PORT: '4300',
        SERVER_PORT: '4301',
        WEB_PORT: '4302',
      },
    });
  });

  it('honours PORT_BASE and COMPOSE_PROJECT_NAME', () => {
    const target = resolveE2eTarget({ PORT_BASE: '4130', COMPOSE_PROJECT_NAME: 'tm-bp' });
    expect(target.baseUrl).toBe('http://localhost:4132');
    expect(target.composeEnv.COMPOSE_PROJECT_NAME).toBe('tm-bp');
  });
});
