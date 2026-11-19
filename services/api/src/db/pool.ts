import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

let pool: Pool | null = null;

/**
 * Determines whether PostgreSQL persistence should be active.
 * Automatically falls back to in-memory mode during Vitest / CI runs
 * unless USE_PG_IN_TEST=true is explicitly set alongside DATABASE_URL.
 */
export function isPostgresEnabled(): boolean {
  const url = process.env.DATABASE_URL;
  if (!url || url.trim().length === 0) {
    return false;
  }

  const isTestEnv = Boolean(process.env.VITEST || process.env.NODE_ENV === 'test');
  const forcePgInTest = process.env.USE_PG_IN_TEST === 'true';
  return !isTestEnv || forcePgInTest;
}

/**
 * Lazily initializes and returns the PostgreSQL Pool.
 * Never opens sockets eagerly on module import.
 */
export function getPool(): Pool | null {
  if (!isPostgresEnabled()) {
    return null;
  }

  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.PG_POOL_MAX) || 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 3_000
    });

    pool.on('error', (err) => {
      console.error('[PG Pool] Unexpected idle client error:', err.message);
    });
  }

  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const activePool = getPool();
  if (!activePool) {
    throw new Error('PostgreSQL is not enabled in the current dual-mode configuration.');
  }
  return activePool.query<T>(text, params);
}

/**
 * Executes an ACID transaction with automatic BEGIN / COMMIT / ROLLBACK handling.
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const activePool = getPool();
  if (!activePool) {
    throw new Error('PostgreSQL is not enabled in the current dual-mode configuration.');
  }

  const client = await activePool.connect();
  await client.query('BEGIN');

  try {
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Ignore secondary rollback error
    }
    throw err;
  } finally {
    client.release();
  }
}

export interface PostgresHealthStatus {
  status: 'up' | 'down' | 'memory';
  latencyMs?: number;
  poolTotal?: number;
  poolIdle?: number;
  details?: string;
}

export async function healthCheck(): Promise<PostgresHealthStatus> {
  if (!isPostgresEnabled()) {
    return {
      status: 'memory',
      details: 'Dual-mode in-memory fallback active'
    };
  }

  const activePool = getPool();
  if (!activePool) {
    return { status: 'down', details: 'PostgreSQL pool unavailable' };
  }

  const start = Date.now();
  try {
    await activePool.query('SELECT 1');
    return {
      status: 'up',
      latencyMs: Date.now() - start,
      poolTotal: activePool.totalCount,
      poolIdle: activePool.idleCount
    };
  } catch (err) {
    return {
      status: 'down',
      latencyMs: Date.now() - start,
      details: err instanceof Error ? err.message : 'PostgreSQL health check failed'
    };
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    const current = pool;
    pool = null;
    await current.end();
  }
}
