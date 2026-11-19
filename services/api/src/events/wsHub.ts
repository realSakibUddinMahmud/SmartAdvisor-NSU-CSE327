import http from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { INITIAL_STUDENT } from '../seedData';
import { verifyAuthToken } from '../middleware/auth';
import { backendStore } from '../store/backendStore';
import { SyncEventEnvelope } from './redisBus';

interface AliveWebSocket extends WebSocket {
  isAlive?: boolean;
  studentId?: string;
}

let wssInstance: WebSocketServer | null = null;
let heartbeatTimer: NodeJS.Timeout | null = null;

async function resolveStudentIdFromRequest(req: http.IncomingMessage): Promise<string> {
  try {
    const parsedUrl = new URL(req.url || '/ws', 'http://localhost');
    const tokenParam = parsedUrl.searchParams.get('token');
    if (tokenParam) {
      const payload = await verifyAuthToken(tokenParam);
      if (payload.role === 'student') {
        return payload.id;
      }
    }
    const studentParam = parsedUrl.searchParams.get('studentId');
    if (studentParam && studentParam.trim().length > 0) {
      return studentParam.trim();
    }
  } catch {
    // Fall back safely to default student ID on unauthenticated/expired WS reconnect
  }
  return INITIAL_STUDENT.id;
}

async function sendResyncSnapshot(ws: AliveWebSocket, studentId: string): Promise<void> {
  if (ws.readyState !== WebSocket.OPEN) return;
  try {
    const state = await backendStore.getStateAsync(studentId);
    const syncFrame: SyncEventEnvelope = {
      type: 'SYNC_UPDATE',
      studentId: state.student.id,
      state,
      timestamp: Date.now()
    };
    ws.send(JSON.stringify(syncFrame));

    if (state.rdsFallbackPrompt && !state.rdsFallbackPrompt.resolved) {
      const fallbackFrame: SyncEventEnvelope = {
        type: 'RDS_FALLBACK',
        studentId: state.student.id,
        state,
        payload: state.rdsFallbackPrompt,
        timestamp: Date.now()
      };
      ws.send(JSON.stringify(fallbackFrame));
    }
  } catch (err) {
    console.error('[WS Hub] Failed to send initial resync snapshot:', err);
  }
}

export function attachWebSocketServer(server: http.Server): WebSocketServer {
  if (wssInstance) {
    return wssInstance;
  }

  const wss = new WebSocketServer({ noServer: true });
  wssInstance = wss;

  server.on('upgrade', (req, socket, head) => {
    try {
      const pathname = new URL(req.url || '/', 'http://localhost').pathname;
      if (pathname !== '/ws') {
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } catch {
      socket.destroy();
    }
  });

  wss.on('connection', (rawWs: WebSocket, req: http.IncomingMessage) => {
    const ws = rawWs as AliveWebSocket;
    ws.isAlive = true;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { type?: string };
        if (msg?.type === 'PING' && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
        } else if (msg?.type === 'RESYNC') {
          void sendResyncSnapshot(ws, ws.studentId || INITIAL_STUDENT.id);
        }
      } catch {
        // Ignore malformed client frames
      }
    });

    void resolveStudentIdFromRequest(req).then((studentId) => {
      ws.studentId = studentId;
      return sendResyncSnapshot(ws, studentId);
    });
  });

  heartbeatTimer = setInterval(() => {
    if (!wssInstance) return;
    for (const client of wssInstance.clients) {
      const ws = client as AliveWebSocket;
      if (ws.isAlive === false) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      try {
        ws.ping();
      } catch {
        ws.terminate();
      }
    }
  }, 30_000);
  heartbeatTimer.unref?.();

  return wss;
}

export function broadcastWsEvent(event: SyncEventEnvelope): void {
  if (!wssInstance) return;
  const serialized = JSON.stringify(event);
  for (const client of wssInstance.clients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(serialized);
      } catch {
        // Ignore individual broken socket
      }
    }
  }
}

export async function closeWebSocketServer(): Promise<void> {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  if (!wssInstance) return;
  const current = wssInstance;
  wssInstance = null;

  for (const client of current.clients) {
    try {
      client.terminate();
    } catch {
      // Ignore
    }
  }

  await new Promise<void>((resolve) => {
    current.close(() => resolve());
  });
}
