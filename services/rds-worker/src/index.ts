import dotenv from 'dotenv';
import {
  closeWorkerPool,
  closeWorkerPubClient,
  createRdsWorker,
  getWorkerPubClient,
  isRedisEnabled
} from './worker';

dotenv.config();

export async function startWorker(): Promise<void> {
  if (!isRedisEnabled()) {
    console.log(
      '[SmartAdvisor RDS Worker] Redis not configured; standing by in dual-mode fallback.'
    );
    return;
  }

  console.log('[SmartAdvisor RDS Worker] Initializing autonomous worker...');
  await getWorkerPubClient();

  const worker = createRdsWorker();

  worker.on('completed', (job) => {
    console.log(`[RDS Worker] Job ${job.id} completed:`, job.returnvalue?.transactionId);
  });

  worker.on('failed', (job, err) => {
    console.error(`[RDS Worker] Job ${job?.id} failed with error:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[RDS Worker] Worker error:', err.message);
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[SmartAdvisor RDS Worker] Received ${signal}, draining active jobs...`);

    const forceTimer = setTimeout(() => {
      process.exit(1);
    }, 5_000);
    forceTimer.unref?.();

    await Promise.allSettled([worker.close(), closeWorkerPubClient(), closeWorkerPool()]);
    clearTimeout(forceTimer);
    process.exit(0);
  };

  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  await worker.run();
  console.log('[SmartAdvisor RDS Worker] Worker is actively listening for jobs.');
}

if (require.main === module) {
  void startWorker().catch((err) => {
    console.error('[SmartAdvisor RDS Worker] Fatal startup error:', err);
    process.exit(1);
  });
}
