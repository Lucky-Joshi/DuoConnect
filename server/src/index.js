import http from 'node:http';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { createApp } from './app.js';
import { closeDb, dbMode, initDb } from './db/index.js';
import { runMigrations } from './db/migrate.js';
import { initRealtime, closeRealtime } from './realtime/index.js';
import { resetPresenceOnBoot } from './realtime/presence.js';
import { reconcileStaleCalls } from './modules/calls/calls.service.js';

let server = null;
let shuttingDown = false;

async function bootstrap() {
  await initDb();
  if (env.DB_AUTO_MIGRATE) await runMigrations();

  await resetPresenceOnBoot();
  await reconcileStaleCalls();

  const app = createApp();
  server = http.createServer(app);
  initRealtime(server);

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(env.PORT, () => {
      server.off('error', reject);
      resolve();
    });
  });

  logger.info(
    {
      port: env.PORT,
      env: env.NODE_ENV,
      database: dbMode(),
      clientOrigins: env.clientOrigins,
    },
    `DuoConnect API listening on http://localhost:${env.PORT}`,
  );
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down');

  const timeout = setTimeout(() => {
    logger.warn('Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, 10_000);
  timeout.unref();

  try {
    await closeRealtime();
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await closeDb();
    clearTimeout(timeout);
    logger.info('Goodbye');
    process.exit(0);
  } catch (error) {
    logger.error({ err: error }, 'Shutdown error');
    process.exit(1);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
});

process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught exception');
  shutdown('uncaughtException');
});

bootstrap().catch(async (error) => {
  logger.fatal({ err: error }, 'Failed to start DuoConnect');
  await closeDb().catch(() => {});
  process.exit(1);
});
