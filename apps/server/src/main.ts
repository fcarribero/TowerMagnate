import { buildApp } from './app';
import { readConfig } from './config';
import { installShutdownHandlers } from './shutdown';
import { readServerVersion } from './version';

const config = readConfig(process.env);
const app = buildApp({
  version: readServerVersion(),
  databaseUrl: config.databaseUrl,
  logger: { level: config.logLevel },
});

installShutdownHandlers(app);

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.fatal({ err: error }, 'Server failed to start');
  process.exit(1);
}
