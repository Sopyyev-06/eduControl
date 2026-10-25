import http from 'http';
import { createApp } from './app';
import { env } from './config/env';
import { dbHealthy, pool } from './db/pool';
import { startReminderJob } from './jobs/reminders';

async function main() {
  const healthy = await dbHealthy();
  if (!healthy) {
    console.error('[startup] database is not reachable — check DB_HOST/DB_USER/DB_PASSWORD');
    process.exit(1);
  }
  const app = createApp();
  const server = http.createServer(app);
  server.headersTimeout = 20_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 100;

  const timer = env.remindersEnabled ? startReminderJob() : null;

  server.listen(env.port, env.host, () => {
    console.log(`[educontrol] listening on http://${env.host}:${env.port} (${env.nodeEnv})`);
  });

  const shutdown = async (signal: string) => {
    console.log(`[educontrol] ${signal} received, shutting down`);
    if (timer) clearInterval(timer);
    server.close(async () => {
      await pool.end().catch(() => undefined);
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((e) => {
  console.error('[startup] fatal:', e);
  process.exit(1);
});
