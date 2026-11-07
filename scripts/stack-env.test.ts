import { describe, expect, it } from 'vitest';
import { deriveStackPorts, readStackProfiles } from './stack-env';

describe('deriveStackPorts', () => {
  it('uses 4100 as the base when PORT_BASE is not set', () => {
    expect(deriveStackPorts({})).toEqual({
      POSTGRES_PORT: '4100',
      SERVER_PORT: '4101',
      WEB_PORT: '4102',
    });
  });

  it('derives consecutive ports from PORT_BASE', () => {
    expect(deriveStackPorts({ PORT_BASE: '4190' })).toEqual({
      POSTGRES_PORT: '4190',
      SERVER_PORT: '4191',
      WEB_PORT: '4192',
    });
  });

  it('keeps a port that is set explicitly', () => {
    expect(deriveStackPorts({ PORT_BASE: '4130', SERVER_PORT: '9000' })).toEqual({
      POSTGRES_PORT: '4130',
      SERVER_PORT: '9000',
      WEB_PORT: '4132',
    });
  });

  it('rejects a PORT_BASE that is not a number', () => {
    expect(() => deriveStackPorts({ PORT_BASE: 'abc' })).toThrow('PORT_BASE');
  });
});

describe('readStackProfiles', () => {
  it('runs the dev profile when COMPOSE_PROFILES is not set', () => {
    expect(readStackProfiles({})).toBe('dev');
    expect(readStackProfiles({ COMPOSE_PROFILES: '' })).toBe('dev');
  });

  it('keeps the profile that is set explicitly', () => {
    expect(readStackProfiles({ COMPOSE_PROFILES: 'prod' })).toBe('prod');
  });
});
