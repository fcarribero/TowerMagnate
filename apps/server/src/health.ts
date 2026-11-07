export interface HealthReport {
  status: 'ok' | 'degraded';
  database: 'ok' | 'unreachable';
}

export async function checkHealth(pingDatabase: () => Promise<void>): Promise<HealthReport> {
  try {
    await pingDatabase();
    return { status: 'ok', database: 'ok' };
  } catch {
    return { status: 'degraded', database: 'unreachable' };
  }
}
