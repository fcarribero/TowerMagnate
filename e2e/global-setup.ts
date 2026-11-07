import { runCompose, waitForHealthy } from './support/stack';
import { resolveE2eTarget } from './support/target';

const STACK_START_TIMEOUT_MS = 5 * 60_000;

export default async function globalSetup(): Promise<() => Promise<void>> {
  const target = resolveE2eTarget(process.env);
  if (!target.startsStack) {
    await waitForHealthy(target.baseUrl, 30_000);
    return async () => {};
  }

  await runCompose(['up', '-d', '--build'], target.composeEnv);
  try {
    await waitForHealthy(target.baseUrl, STACK_START_TIMEOUT_MS);
  } catch (error) {
    await runCompose(['logs', '--tail', '100'], target.composeEnv).catch(() => {});
    await runCompose(['down'], target.composeEnv);
    throw error;
  }
  return () => runCompose(['down'], target.composeEnv);
}
