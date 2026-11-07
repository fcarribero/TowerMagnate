import { migrateDatabase } from './migrations';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

try {
  const applied = await migrateDatabase(databaseUrl, {
    onApplied: (name) => console.log(`Applied ${name}`),
  });
  console.log(
    applied.length === 0 ? 'Database is up to date' : `Applied ${applied.length} migration(s)`,
  );
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}
