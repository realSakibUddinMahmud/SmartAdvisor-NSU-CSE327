import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';
import { Request } from 'express';

export interface RateLimiterOptions {
  windowMs?: number;
  max?: number;
  forceEnable?: boolean;
}

function shouldSkipRateLimit(req: Request, forceEnable = false): boolean {
  if (forceEnable) return false;
  const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
  if (!isTest) return false;
  return req.headers['x-enable-rate-limit'] !== 'true';
}

export function createAuthRateLimiter(options?: RateLimiterOptions): RateLimitRequestHandler {
  return rateLimit({
    windowMs: options?.windowMs ?? (Number(process.env.AUTH_RATE_WINDOW_MS) || 60_000),
    max: options?.max ?? (Number(process.env.AUTH_RATE_LIMIT_MAX) || 10),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      ok: false,
      message: 'Too many login attempts. Please try again later.',
      code: 'RATE_LIMIT_EXCEEDED'
    },
    skip: (req) => shouldSkipRateLimit(req, options?.forceEnable)
  });
}

export function createApiRateLimiter(options?: RateLimiterOptions): RateLimitRequestHandler {
  return rateLimit({
    windowMs: options?.windowMs ?? (Number(process.env.API_RATE_WINDOW_MS) || 60_000),
    max: options?.max ?? (Number(process.env.API_RATE_LIMIT_MAX) || 120),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      ok: false,
      message: 'Rate limit exceeded. Please slow down requests.',
      code: 'RATE_LIMIT_EXCEEDED'
    },
    skip: (req) => shouldSkipRateLimit(req, options?.forceEnable)
  });
}

export const authRateLimiter = createAuthRateLimiter();
export const apiRateLimiter = createApiRateLimiter();
