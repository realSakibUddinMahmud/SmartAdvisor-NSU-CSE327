import { EventEmitter } from 'events';
import Redis, { RedisOptions } from 'ioredis';
import { BackendState, ComponentHealth } from '../types';
import { backendStore } from '../store/backendStore';

export const SYNC_CHANNEL = 'smartadvisor-sync';

export type SyncEventType = 'SYNC_UPDATE' | 'RDS_FALLBACK' | 'NOTIFICATION';

export interface SyncEventEnvelope {
  type: SyncEventType;
  state?: BackendState;
  payload?: unknown;
  studentId?: string;
  source?: string;
  timestamp: number;
}

export type SyncEventListener = (event: SyncEventEnvelope) => void;

/**
 * Dual-mode Redis guard mirroring db/pool.ts:
 * disabled automatically during Vitest / test runs unless USE_REDIS_IN_TEST=true.
 */
export function isRedisEnabled(): boolean {
  const hasUrl = Boolean(process.env.REDIS_URL && process.env.REDIS_URL.trim().length > 0);
  const hasHost = Boolean(process.env.REDIS_HOST && process.env.REDIS_HOST.trim().length > 0);
  if (!hasUrl && !hasHost) {
    return false;
  }

  const isTestEnv = Boolean(process.env.VITEST || process.env.NODE_ENV === 'test');
  const forceRedisInTest = process.env.USE_REDIS_IN_TEST === 'true';
  return !isTestEnv || forceRedisInTest;
}

export function getRedisConnectionOptions(): RedisOptions {
  if (process.env.REDIS_URL && process.env.REDIS_URL.trim().length > 0) {
    const parsed = new URL(process.env.REDIS_URL.trim());
    return {
      host: parsed.hostname || 'localhost',
      port: parsed.port ? Number(parsed.port) : 6379,
      username: parsed.username || undefined,
      password: parsed.password || undefined,
      tls: parsed.protocol === 'rediss:' ? {} : undefined
    };
  }

  return {
    host: process.env.REDIS_HOST?.trim() || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined
  };
}

class RedisBus {
  private emitter = new EventEmitter();
  private pubClient: Redis | null = null;
  private subClient: Redis | null = null;
  private connectingPromise: Promise<void> | null = null;

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  private createClient(role: 'pub' | 'sub'): Redis {
    const client = new Redis({
      ...getRedisConnectionOptions(),
      lazyConnect: true,
      connectTimeout: 2000,
      maxRetriesPerRequest: 2,
      retryStrategy: (times: number) => Math.min(times * 200, 2000)
    });

    client.on('error', (err) => {
      console.error(`[RedisBus:${role}]`, err.message);
    });

    return client;
  }

  public async connect(): Promise<void> {
    if (!isRedisEnabled()) {
      return;
    }

    if (this.connectingPromise) {
      return this.connectingPromise;
    }

    if (this.pubClient && this.subClient && this.subClient.status === 'ready') {
      return;
    }

    this.connectingPromise = (async () => {
      const pub = this.createClient('pub');
      const sub = this.createClient('sub');

      sub.on('message', (channel: string, rawMessage: string) => {
        if (channel !== SYNC_CHANNEL) return;
        void this.handleIncomingRedisMessage(rawMessage);
      });

      await Promise.all([pub.connect(), sub.connect()]);
      await sub.subscribe(SYNC_CHANNEL);

      this.pubClient = pub;
      this.subClient = sub;
    })();

    try {
      await this.connectingPromise;
    } finally {
      this.connectingPromise = null;
    }
  }

  private async handleIncomingRedisMessage(rawMessage: string): Promise<void> {
    try {
      const parsed = JSON.parse(rawMessage) as SyncEventEnvelope;
      if (!parsed || !parsed.type) return;

      if (!parsed.state && (parsed.type === 'SYNC_UPDATE' || parsed.type === 'RDS_FALLBACK')) {
        parsed.state = await backendStore.getStateAsync(parsed.studentId);
      }

      this.emitter.emit('sync', parsed);
    } catch (err) {
      console.error('[RedisBus] Failed to handle incoming Pub/Sub message:', err);
    }
  }

  public async publishSyncEvent(event: SyncEventEnvelope): Promise<void> {
    const normalized: SyncEventEnvelope = {
      ...event,
      timestamp: event.timestamp || Date.now()
    };

    if (isRedisEnabled()) {
      try {
        if (!this.pubClient) {
          await this.connect();
        }
        if (this.pubClient && this.pubClient.status === 'ready') {
          await this.pubClient.publish(SYNC_CHANNEL, JSON.stringify(normalized));
          return;
        }
      } catch (err) {
        console.error('[RedisBus] Publish failed, falling back to local bus:', err);
      }
    }

    this.emitter.emit('sync', normalized);
  }

  public subscribeSyncEvents(listener: SyncEventListener): () => void {
    this.emitter.on('sync', listener);
    return () => {
      this.emitter.off('sync', listener);
    };
  }

  public async probeRedisHealth(): Promise<ComponentHealth> {
    if (!isRedisEnabled()) {
      return {
        status: 'memory',
        details: 'Dual-mode in-memory EventEmitter fallback active'
      };
    }

    const start = Date.now();
    let tempClient: Redis | null = null;
    try {
      let client = this.pubClient;
      if (!client || client.status !== 'ready') {
        tempClient = new Redis({
          ...getRedisConnectionOptions(),
          lazyConnect: true,
          connectTimeout: 1500,
          maxRetriesPerRequest: 1,
          retryStrategy: () => null
        });
        tempClient.on('error', () => {
          // Handled by ping failure catch below
        });
        await tempClient.connect();
        client = tempClient;
      }

      const pong = await Promise.race([
        client.ping(),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error('Redis ping timeout')), 1500)
        )
      ]);

      return {
        status: pong === 'PONG' ? 'up' : 'down',
        latencyMs: Date.now() - start
      };
    } catch (err) {
      return {
        status: 'down',
        latencyMs: Date.now() - start,
        details: err instanceof Error ? err.message : 'Redis health check failed'
      };
    } finally {
      if (tempClient) {
        try {
          tempClient.disconnect();
        } catch {
          // Ignore disconnect error on temp probe client
        }
      }
    }
  }

  public async close(): Promise<void> {
    const closeClient = async (client: Redis | null) => {
      if (!client) return;
      try {
        await Promise.race([
          client.quit(),
          new Promise<void>((resolve) => setTimeout(resolve, 1000))
        ]);
      } catch {
        // Fallback to immediate disconnect
      } finally {
        try {
          client.disconnect();
        } catch {
          // Ignore
        }
      }
    };

    const sub = this.subClient;
    const pub = this.pubClient;
    this.subClient = null;
    this.pubClient = null;
    this.connectingPromise = null;

    if (sub && sub.status === 'ready') {
      try {
        await sub.unsubscribe(SYNC_CHANNEL);
      } catch {
        // Ignore unsubscribe failure during teardown
      }
    }

    await Promise.all([closeClient(sub), closeClient(pub)]);
  }
}

export const redisBus = new RedisBus();
