export interface HealthReport {
  status: 'ok' | 'degraded';
  version: string;
  database: 'ok' | 'unreachable';
}

export async function checkHealth(
  version: string,
  pingDatabase: () => Promise<void>,
): Promise<HealthReport> {
  try {
    await pingDatabase();
    return { status: 'ok', version, database: 'ok' };
  } catch {
    return { status: 'degraded', version, database: 'unreachable' };
  }
}
