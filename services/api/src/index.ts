import dotenv from 'dotenv';
import http from 'http';
import { createApp } from './app';
import { runMigrations } from './db/migrate';
import { closePool } from './db/pool';
import { closeRdsQueue } from './events/rdsQueue';
import { redisBus } from './events/redisBus';
import { startSlaMonitorInterval, stopSlaMonitorInterval } from './events/slaMonitor';
import { closeAllSseClients } from './events/sseHub';
import { attachWebSocketServer, closeWebSocketServer } from './events/wsHub';
import { startRds4SyncScheduler, stopRds4SyncScheduler } from './services/rds4Sync';

dotenv.config();

const PORT = Number(process.env.PORT) || 4000;

export async function startServer(): Promise<http.Server> {
  const migration = await runMigrations();
  console.log(
    `[SmartAdvisor API] Persistence mode: ${migration.mode} (migrated=${migration.migrated}, seeded=${migration.seeded})`
  );

  await redisBus.connect();

  const app = createApp();
  const server = http.createServer(app);
  attachWebSocketServer(server);

  startRds4SyncScheduler();
  startSlaMonitorInterval();

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[SmartAdvisor API] Received ${signal}, shutting down gracefully...`);

    const forceExitTimer = setTimeout(() => {
      process.exit(1);
    }, 5_000);
    forceExitTimer.unref?.();

    stopRds4SyncScheduler();
    stopSlaMonitorInterval();
    closeAllSseClients();

    await Promise.allSettled([
      closeWebSocketServer(),
      closeRdsQueue(),
      redisBus.close(),
      closePool()
    ]);

    server.close(() => {
      clearTimeout(forceExitTimer);
      process.exit(0);
    });
  };

  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  await new Promise<void>((resolve) => {
    server.listen(PORT, () => {
      console.log(`[SmartAdvisor API] HTTP + WS + SSE server listening on port ${PORT}`);
      resolve();
    });
  });

  return server;
}

if (require.main === module) {
  void startServer().catch((err) => {
    console.error('[SmartAdvisor API] Fatal startup error:', err);
    process.exit(1);
  });
}
