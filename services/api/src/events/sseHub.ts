import { Router, Request, Response } from 'express';
import { SyncEventEnvelope } from './redisBus';

export const sseRouter = Router();

const clients = new Set<Response>();
let keepaliveTimer: NodeJS.Timeout | null = null;

function ensureKeepaliveStarted(): void {
  if (keepaliveTimer) return;
  keepaliveTimer = setInterval(() => {
    for (const res of clients) {
      try {
        res.write(': keepalive\n\n');
      } catch {
        clients.delete(res);
      }
    }
    if (clients.size === 0 && keepaliveTimer) {
      clearInterval(keepaliveTimer);
      keepaliveTimer = null;
    }
  }, 25_000);
  keepaliveTimer.unref?.();
}

export function broadcastSseEvent(event: SyncEventEnvelope): void {
  const serialized = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of clients) {
    try {
      if (!res.writableEnded) {
        res.write(serialized);
      } else {
        clients.delete(res);
      }
    } catch {
      clients.delete(res);
    }
  }
}

export function closeAllSseClients(): void {
  if (keepaliveTimer) {
    clearInterval(keepaliveTimer);
    keepaliveTimer = null;
  }
  for (const res of clients) {
    try {
      if (!res.writableEnded) {
        res.end();
      }
    } catch {
      // Ignore
    }
  }
  clients.clear();
}

sseRouter.get('/events', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (res.flushHeaders) {
    res.flushHeaders();
  }

  res.write(': connected\n\n');
  clients.add(res);
  ensureKeepaliveStarted();

  req.on('close', () => {
    clients.delete(res);
    if (clients.size === 0 && keepaliveTimer) {
      clearInterval(keepaliveTimer);
      keepaliveTimer = null;
    }
    if (!res.writableEnded) {
      res.end();
    }
  });
});
