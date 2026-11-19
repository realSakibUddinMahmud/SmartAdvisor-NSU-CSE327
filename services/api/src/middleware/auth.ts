import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import jwt, { SignOptions } from 'jsonwebtoken';
import { AuthTokenPayload, AuthUser } from '../types';
import { backendStore } from '../store/backendStore';

declare global {
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
      authTokenJti?: string;
    }
  }
}

export class AuthError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode = 401) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
  }
}

function getJwtSecret(): string {
  const envSecret = process.env.JWT_SECRET;
  if (envSecret && envSecret.trim().length >= 16) {
    return envSecret;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET environment variable must be configured (>= 16 chars) in production.');
  }
  return 'smartadvisor-dev-jwt-secret-change-in-prod';
}

export function getJwtExpiresIn(): string {
  return process.env.JWT_EXPIRES_IN || '15m';
}

export function signAuthToken(
  user: AuthUser,
  options?: { expiresIn?: SignOptions['expiresIn'] }
): { token: string; jti: string; expiresAt: number } {
  const jti = crypto.randomUUID();
  const expiresIn = options?.expiresIn ?? (getJwtExpiresIn() as SignOptions['expiresIn']);
  const payload: Omit<AuthTokenPayload, 'iat' | 'exp'> = {
    id: user.id,
    name: user.name,
    role: user.role,
    email: user.email,
    department: user.department,
    instructorName: user.instructorName,
    jti
  };

  const token = jwt.sign(payload, getJwtSecret(), {
    algorithm: 'HS256',
    expiresIn
  });

  const decoded = jwt.decode(token) as { exp?: number } | null;
  const expiresAt = decoded?.exp ? decoded.exp * 1000 : Date.now() + 15 * 60_000;

  return { token, jti, expiresAt };
}

export async function verifyAuthToken(token: string): Promise<AuthTokenPayload> {
  let decoded: unknown;
  try {
    decoded = jwt.verify(token, getJwtSecret(), {
      algorithms: ['HS256']
    });
  } catch {
    throw new AuthError('Invalid or expired authorization token', 401);
  }

  if (!decoded || typeof decoded !== 'object') {
    throw new AuthError('Malformed authorization token payload', 401);
  }

  const payload = decoded as Partial<AuthTokenPayload>;
  if (!payload.id || !payload.role || !payload.jti) {
    throw new AuthError('Authorization token missing required claims', 401);
  }

  const revoked = await backendStore.isTokenRevoked(payload.jti);
  if (revoked) {
    throw new AuthError('Authorization token has been revoked', 401);
  }

  return payload as AuthTokenPayload;
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || typeof header !== 'string') {
    return null;
  }
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({
      ok: false,
      message: 'Missing or invalid authorization token'
    });
    return;
  }

  try {
    const payload = await verifyAuthToken(token);
    req.user = payload;
    req.authTokenJti = payload.jti;
    next();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Token invalid, expired, or revoked';
    res.status(401).json({
      ok: false,
      message
    });
  }
}

export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization;
  if (!header) {
    next();
    return;
  }

  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({
      ok: false,
      message: 'Malformed authorization header'
    });
    return;
  }

  try {
    const payload = await verifyAuthToken(token);
    req.user = payload;
    req.authTokenJti = payload.jti;
    next();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Token invalid, expired, or revoked';
    res.status(401).json({
      ok: false,
      message
    });
  }
}
