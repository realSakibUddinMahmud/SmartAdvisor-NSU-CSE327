import { Router, Request, Response } from 'express';
import { getJwtExpiresIn, requireAuth, signAuthToken } from '../middleware/auth';
import { authRateLimiter } from '../middleware/rateLimit';
import { validateBody, loginSchema } from '../middleware/validate';
import { verifyPassword } from '../seedData';
import { backendStore } from '../store/backendStore';
import { AuthUser } from '../types';

export const authRouter = Router();

/**
 * POST /api/v1/auth/login
 * Body: { id: string; password: string; role?: 'student' | 'faculty' | 'admin' }
 */
authRouter.post(
  '/login',
  authRateLimiter,
  validateBody(loginSchema),
  async (req: Request, res: Response) => {
    const { id, password, role } = req.body as {
      id: string;
      password: string;
      role?: AuthUser['role'];
    };

    const user = await backendStore.findUserById(id);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({
        ok: false,
        message: 'Invalid user ID or password'
      });
    }

    if (role && role !== user.role) {
      return res.status(401).json({
        ok: false,
        message: 'Role mismatch for user account'
      });
    }

    const authUser: AuthUser = {
      id: user.id,
      name: user.name,
      role: user.role,
      email: user.email,
      department: user.department,
      instructorName: user.instructorName ?? undefined
    };

    const { token } = signAuthToken(authUser);

    return res.status(200).json({
      ok: true,
      token,
      user: authUser,
      expiresIn: getJwtExpiresIn()
    });
  }
);

/**
 * POST /api/v1/auth/logout
 * Revokes the current Bearer JWT jti in the blocklist.
 */
authRouter.post('/logout', requireAuth, async (req: Request, res: Response) => {
  const jti = req.authTokenJti!;
  const user = req.user!;
  const expiresAtMs = user.exp ? user.exp * 1000 : Date.now() + 15 * 60_000;

  await backendStore.revokeToken(jti, user.id, expiresAtMs);

  return res.status(200).json({
    ok: true,
    message: 'Token invalidated'
  });
});

/**
 * GET /api/v1/auth/me
 * Returns the authenticated user claims.
 */
authRouter.get('/me', requireAuth, (req: Request, res: Response) => {
  const u = req.user!;
  const user: AuthUser = {
    id: u.id,
    name: u.name,
    role: u.role,
    email: u.email,
    department: u.department,
    instructorName: u.instructorName
  };

  return res.status(200).json({
    ok: true,
    user
  });
});
