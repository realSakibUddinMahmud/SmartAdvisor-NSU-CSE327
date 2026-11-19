import { NextFunction, Request, Response } from 'express';
import { AuthUser, CourseSection, UserRole } from '../types';

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        ok: false,
        message: 'Authentication required'
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        ok: false,
        message: 'Forbidden: insufficient role permissions',
        requiredRoles: allowedRoles,
        actualRole: req.user.role
      });
      return;
    }

    next();
  };
}

function normalizeName(name: string | undefined): string {
  return (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function canManageSection(user: AuthUser, section: CourseSection): boolean {
  if (user.role === 'admin') {
    return true;
  }
  if (user.role !== 'faculty') {
    return false;
  }

  if (section.instructorId) {
    return section.instructorId === user.id;
  }

  const sectionFaculty = normalizeName(section.faculty);
  return (
    sectionFaculty === normalizeName(user.name) ||
    (Boolean(user.instructorName) && sectionFaculty === normalizeName(user.instructorName))
  );
}
