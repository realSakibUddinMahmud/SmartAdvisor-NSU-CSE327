import express, { Express, NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { healthCheck as pgHealthCheck, isPostgresEnabled } from './db/pool';
import { initRealtimeBridge } from './events/realtimeBridge';
import { redisBus } from './events/redisBus';
import { sseRouter } from './events/sseHub';
import { apiRateLimiter } from './middleware/rateLimit';
import { csrfOriginGuard, securityHeaders } from './middleware/security';
import { adminRouter } from './routes/admin';
import { authRouter } from './routes/auth';
import { bootstrapRouter } from './routes/bootstrap';
import { demoRouter } from './routes/demo';
import { facultyRouter } from './routes/faculty';
import { studentRouter } from './routes/student';
import { HealthCheckResult } from './types';

export function createApp(): Express {
  initRealtimeBridge();

  const application = express();

  application.set('trust proxy', 1);
  application.use(securityHeaders);
  application.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) {
          callback(null, true);
          return;
        }
        const configured = process.env.CORS_ALLOWED_ORIGINS;
        if (!configured || configured.trim().length === 0) {
          callback(null, true);
          return;
        }
        const allowed = configured
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        callback(null, allowed.includes(origin));
      },
      credentials: true
    })
  );
  application.use(csrfOriginGuard());
  application.use(express.json({ limit: '1mb' }));

  application.get('/health', async (_req: Request, res: Response) => {
    const [pg, redis] = await Promise.all([pgHealthCheck(), redisBus.probeRedisHealth()]);
    const degraded = pg.status === 'down' || redis.status === 'down';
    const mode: 'postgres' | 'memory' = isPostgresEnabled() ? 'postgres' : 'memory';

    const result: HealthCheckResult = {
      status: degraded ? 'degraded' : 'ok',
      service: 'smartadvisor-api',
      mode,
      checks: {
        api: { status: 'up' },
        postgres: pg,
        redis
      },
      timestamp: new Date().toISOString()
    };

    res.status(degraded ? 503 : 200).json(result);
  });

  application.get('/', (_req: Request, res: Response) => {
    res.status(200).json({
      message: 'Welcome to SmartAdvisor NSU API',
      course: 'CSE 327 Sec 04',
      supervisor: 'Intisar Tahmeed (ITN)'
    });
  });

  application.use('/api/v1', apiRateLimiter);
  application.use('/api/v1/auth', authRouter);
  application.use('/api/v1', bootstrapRouter);
  application.use('/api/v1', sseRouter);
  application.use('/api/v1/student', studentRouter);
  application.use('/api/v1/faculty', facultyRouter);
  application.use('/api/v1/admin', adminRouter);
  application.use('/api/v1/demo', demoRouter);

  // Express JSON syntax & unhandled route error handler
  application.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json({
        ok: false,
        message: 'Invalid JSON request body'
      });
      return;
    }

    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[SmartAdvisor API Error]', err);
    res.status(500).json({
      ok: false,
      message
    });
  });

  return application;
}

export const app = createApp();
