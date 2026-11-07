import { createServer } from 'node:http';
import pg from 'pg';
import { readConfig } from './config';
import { checkHealth } from './health';

const config = readConfig(process.env);
const pool = new pg.Pool({ connectionString: config.databaseUrl });

async function pingDatabase(): Promise<void> {
  await pool.query('select 1');
}

const server = createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    const report = await checkHealth(pingDatabase);
    const statusCode = report.status === 'ok' ? 200 : 503;
    response.writeHead(statusCode, { 'content-type': 'application/json' });
    response.end(JSON.stringify(report));
    return;
  }
  response.writeHead(404);
  response.end();
});

server.listen(config.port, () => {
  console.log(`Server listening on port ${config.port}`);
});

async function shutdown(): Promise<void> {
  server.close();
  await pool.end();
}

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
