import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { isPostgresEnabled, withTransaction } from '../db/pool';
import { redisBus } from '../events/redisBus';
import { evaluateSlaBreach, resetSlaMonitor } from '../events/slaMonitor';
import { stageCartSchema, validateBody } from '../middleware/validate';
import { backendStore } from '../store/backendStore';

export const demoRouter = Router();

/**
 * POST /api/v1/demo/surge
 */
demoRouter.post('/surge', async (_req: Request, res: Response) => {
  let state;

  if (!isPostgresEnabled()) {
    backendStore.updateState((s) => {
      s.metrics = {
        ...s.metrics,
        requestsPerSec: 3450,
        p95LatencyMs: 275,
        poolUsed: 194,
        surgeSpikeActive: true,
        lastScalingEvent: 'Simulated high-concurrency surge spike triggered.'
      };
    });

    backendStore.addAuditLog(
      'Surge Simulation Generator',
      'Traffic Spike Injected',
      'Injected 3,450 req/s load. P95 latency jumped to 275 ms (Breaching SLA Ceiling).',
      'crimson'
    );

    state = backendStore.getState();
  } else {
    await withTransaction(async (client) => {
      const mRes = await client.query('SELECT * FROM admin_metrics ORDER BY id DESC LIMIT 1');
      const cur = mRes.rows[0];
      const apiNodes = cur ? Number(cur.api_nodes) : 6;

      await client.query(
        `INSERT INTO admin_metrics (
          requests_per_sec, p95_latency_ms, sla_ceiling_ms, error_rate,
          pool_used, pool_total, api_nodes, surge_spike_active, last_scaling_event
        ) VALUES (3450, 275, 200, $1, 194, $2, $3, TRUE, $4)`,
        [
          cur ? Number(cur.error_rate) : 0.08,
          cur ? Number(cur.pool_total) : 200,
          apiNodes,
          'Simulated high-concurrency surge spike triggered.'
        ]
      );

      const ts = new Date().toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
      await client.query(
        `INSERT INTO audit_logs (id, timestamp, actor, action, details, badge_type)
         VALUES ($1, $2, $3, $4, $5, 'crimson')`,
        [
          `log-surge-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
          ts,
          'Surge Simulation Generator',
          'Traffic Spike Injected',
          'Injected 3,450 req/s load. P95 latency jumped to 275 ms (Breaching SLA Ceiling).'
        ]
      );
    });

    state = await backendStore.getStateAsync();
    await redisBus.publishSyncEvent({
      type: 'SYNC_UPDATE',
      studentId: state.student.id,
      state,
      timestamp: Date.now()
    });
  }

  await evaluateSlaBreach();

  return res.status(200).json({
    ok: true,
    state
  });
});

/**
 * POST /api/v1/demo/section-full
 * Body: { sectionId: string }
 */
demoRouter.post(
  '/section-full',
  validateBody(stageCartSchema),
  async (req: Request, res: Response) => {
    const { sectionId } = req.body as { sectionId: string };
    const current = await backendStore.getStateAsync();
    const targetSection = current.sections.find((s) => s.id === sectionId);

    if (!targetSection) {
      return res.status(404).json({
        ok: false,
        message: 'Section not found'
      });
    }

    const updatedSections = current.sections.map((sec) =>
      sec.id === sectionId ? { ...sec, enrolled: sec.capacity } : sec
    );

    const state = await backendStore.syncRds4SectionsTx(updatedSections, {
      actor: 'Seat Contention Daemon',
      details: `${targetSection.courseCode} Sec ${targetSection.sectionNumber} reached full capacity (0 available).`
    });

    return res.status(200).json({
      ok: true,
      state
    });
  }
);

/**
 * POST /api/v1/demo/reset
 */
demoRouter.post('/reset', async (_req: Request, res: Response) => {
  const state = await backendStore.resetStateAsync();
  resetSlaMonitor();

  return res.status(200).json({
    ok: true,
    state
  });
});
