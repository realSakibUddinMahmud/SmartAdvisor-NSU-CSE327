import { isPostgresEnabled, withTransaction } from '../db/pool';
import { backendStore } from '../store/backendStore';
import { redisBus } from './redisBus';

let breachStartedAtMs: number | null = null;
let alertEmittedForCurrentBreach = false;
let monitorTimer: NodeJS.Timeout | null = null;

export interface SlaEvaluationResult {
  breached: boolean;
  alertEmitted: boolean;
  durationMs: number;
}

export function resetSlaMonitor(): void {
  breachStartedAtMs = null;
  alertEmittedForCurrentBreach = false;
}

export async function evaluateSlaBreach(nowMs = Date.now()): Promise<SlaEvaluationResult> {
  const state = await backendStore.getStateAsync();
  const { p95LatencyMs, slaCeilingMs } = state.metrics;

  if (p95LatencyMs <= slaCeilingMs) {
    breachStartedAtMs = null;
    alertEmittedForCurrentBreach = false;
    return { breached: false, alertEmitted: false, durationMs: 0 };
  }

  if (breachStartedAtMs === null) {
    breachStartedAtMs = nowMs;
    return { breached: true, alertEmitted: false, durationMs: 0 };
  }

  const durationMs = nowMs - breachStartedAtMs;
  if (!alertEmittedForCurrentBreach && durationMs >= 60_000) {
    alertEmittedForCurrentBreach = true;
    const details = `P95 latency ${p95LatencyMs} ms exceeded ${slaCeilingMs} ms SLA ceiling for ${Math.round(durationMs / 1000)}s.`;

    if (!isPostgresEnabled()) {
      backendStore.updateState((s) => {
        s.metrics = {
          ...s.metrics,
          surgeSpikeActive: true
        };
      });
      backendStore.addAuditLog(
        'SLA Telemetry Monitor',
        'SLA Breach Alert (1m)',
        details,
        'crimson'
      );
    } else {
      await withTransaction(async (client) => {
        const ts = new Date().toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        });
        await client.query(
          `INSERT INTO audit_logs (id, timestamp, actor, action, details, badge_type)
           VALUES ($1, $2, $3, $4, $5, 'crimson')`,
          [`log-sla-${Date.now()}`, ts, 'SLA Telemetry Monitor', 'SLA Breach Alert (1m)', details]
        );
        const mRes = await client.query('SELECT * FROM admin_metrics ORDER BY id DESC LIMIT 1');
        const cur = mRes.rows[0];
        if (cur && !cur.surge_spike_active) {
          await client.query(
            `INSERT INTO admin_metrics (
              requests_per_sec, p95_latency_ms, sla_ceiling_ms, error_rate,
              pool_used, pool_total, api_nodes, surge_spike_active, last_scaling_event
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8)`,
            [
              Number(cur.requests_per_sec),
              Number(cur.p95_latency_ms),
              Number(cur.sla_ceiling_ms),
              Number(cur.error_rate),
              Number(cur.pool_used),
              Number(cur.pool_total),
              Number(cur.api_nodes),
              'SLA Breach Alert (1m) triggered.'
            ]
          );
        }
      });

      const nextState = await backendStore.getStateAsync();
      await redisBus.publishSyncEvent({
        type: 'SYNC_UPDATE',
        studentId: nextState.student.id,
        state: nextState,
        timestamp: Date.now()
      });
    }

    return { breached: true, alertEmitted: true, durationMs };
  }

  return { breached: true, alertEmitted: false, durationMs };
}

export function startSlaMonitorInterval(intervalMs = 5_000): void {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    return;
  }
  if (monitorTimer) {
    return;
  }
  monitorTimer = setInterval(() => {
    void evaluateSlaBreach().catch((err) => {
      console.error('[SLA Monitor] Evaluation error:', err);
    });
  }, intervalMs);
  monitorTimer.unref?.();
}

export function stopSlaMonitorInterval(): void {
  if (monitorTimer) {
    clearInterval(monitorTimer);
    monitorTimer = null;
  }
}
