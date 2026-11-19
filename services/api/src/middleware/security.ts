import { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';

export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", 'ws:', 'wss:']
    }
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  frameguard: { action: 'deny' },
  referrerPolicy: { policy: 'no-referrer' },
  hsts: process.env.NODE_ENV === 'production' ? undefined : false
});

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function csrfOriginGuard(allowedOrigins?: string[]) {
  const configured =
    allowedOrigins ??
    (process.env.CORS_ALLOWED_ORIGINS
      ? process.env.CORS_ALLOWED_ORIGINS.split(',').map((s) => s.trim())
      : ['http://localhost:3000', 'http://127.0.0.1:3000']);

  return (req: Request, res: Response, next: NextFunction): void => {
    if (process.env.CSRF_ENFORCE !== 'true' || !MUTATING_METHODS.has(req.method)) {
      next();
      return;
    }

    const origin = req.headers.origin;
    if (origin && !configured.includes(origin)) {
      res.status(403).json({
        ok: false,
        message: 'Forbidden: untrusted origin',
        code: 'CSRF_ORIGIN_REJECTED'
      });
      return;
    }

    next();
  };
}
