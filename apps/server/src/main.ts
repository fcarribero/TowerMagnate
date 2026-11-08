import { buildApp } from './app';
import { readConfig } from './config';
import { migrateDatabase } from './migrations';
import { installShutdownHandlers } from './shutdown';
import { readServerVersion } from './version';

const config = readConfig(process.env);
const app = buildApp({
  version: readServerVersion(),
  databaseUrl: config.databaseUrl,
  secureCookies: config.secureCookies,
  allowedOrigins: config.allowedOrigins,
  logger: { level: config.logLevel },
  webDir: config.webDir,
  debugCommands: config.debugCommands,
});

installShutdownHandlers(app);

try {
  if (config.migrateOnStart) {
    const applied = await migrateDatabase(config.databaseUrl, {
      onApplied: (name) => app.log.info({ migration: name }, 'Applied migration'),
    });
    app.log.info({ applied: applied.length }, 'Database migrations done');
  }
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.fatal({ err: error }, 'Server failed to start');
  process.exit(1);
}
