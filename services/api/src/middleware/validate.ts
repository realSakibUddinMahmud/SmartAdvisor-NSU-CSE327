import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

const SQLI_PATTERNS: RegExp[] = [
  /\b(UNION\s+ALL\s+SELECT|UNION\s+SELECT|DROP\s+TABLE|DROP\s+DATABASE|DELETE\s+FROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET|ALTER\s+TABLE|EXEC\s*\(|EXECUTE\s+IMMEDIATE)\b/i,
  /(?:(?:['";)]|=\s*['"\w]+)\s*--|--\s*$|\/\*|\*\/|;\s*(?:SELECT|DROP|DELETE|INSERT|UPDATE|EXEC)\b)/i,
  /(['"]\s*(OR|AND)\s+(?:['"][^'"]*['"]|\w+)\s*=\s*(?:['"][^'"]*['"]?|\w+))/i,
  /\b(SLEEP\s*\(|BENCHMARK\s*\(|WAITFOR\s+DELAY|XP_CMDSHELL)\b/i
];

const XSS_PATTERNS: RegExp[] = [
  /<\s*script\b/i,
  /<\s*\/\s*script\s*>/i,
  /\b(javascript|vbscript)\s*:/i,
  /data\s*:\s*text\/html/i,
  /\bon(error|load|click|mouseover|focus|submit|mouseenter)\s*=/i,
  /<\s*(iframe|object|embed|svg|img)\b[^>]*\b(on\w+|src\s*=\s*['"]?\s*javascript:)/i,
  /<\s*[a-z][a-z0-9]*\b[^>]*>/i
];

export function containsSqlInjection(value: string): boolean {
  return SQLI_PATTERNS.some((pattern) => pattern.test(value));
}

export function containsXssPayload(value: string): boolean {
  return XSS_PATTERNS.some((pattern) => pattern.test(value));
}

export function sanitizeInputString(value: string): string {
  return value
    .replace(/\0/g, '')
    .trim()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function assertSafePayload(
  obj: unknown,
  currentPath = ''
): { safe: boolean; field?: string; reason?: string } {
  if (obj === null || obj === undefined) {
    return { safe: true };
  }

  if (typeof obj === 'string') {
    const fieldName = currentPath.split('.').pop() || currentPath || 'input';

    if (obj.includes('\0')) {
      return { safe: false, field: fieldName, reason: 'Null byte detected in input' };
    }

    // Passwords may legitimately include '--', quotes, or '<...>'; check null bytes only for password
    const isPasswordField = fieldName.toLowerCase() === 'password';
    if (!isPasswordField && containsSqlInjection(obj)) {
      return { safe: false, field: fieldName, reason: 'SQL injection signature detected' };
    }

    if (!isPasswordField && containsXssPayload(obj)) {
      return { safe: false, field: fieldName, reason: 'XSS payload signature detected' };
    }

    return { safe: true };
  }

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const res = assertSafePayload(obj[i], `${currentPath}[${i}]`);
      if (!res.safe) return res;
    }
    return { safe: true };
  }

  if (typeof obj === 'object') {
    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
      const nextPath = currentPath ? `${currentPath}.${key}` : key;
      const res = assertSafePayload(val, nextPath);
      if (!res.safe) return res;
    }
  }

  return { safe: true };
}

function formatZodErrors(err: z.ZodError) {
  return err.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message
  }));
}

export function validateBody<T>(
  schema: z.ZodType<T>,
  options?: { statusCode?: 400 | 422 }
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (
      req.body !== undefined &&
      (req.body === null || typeof req.body !== 'object' || Array.isArray(req.body))
    ) {
      res.status(400).json({
        ok: false,
        message: 'Request body must be a JSON object'
      });
      return;
    }

    if (req.body !== undefined) {
      const safety = assertSafePayload(req.body);
      if (!safety.safe) {
        res.status(400).json({
          ok: false,
          message: 'Potentially malicious input detected',
          code: 'SECURITY_INPUT_REJECTED',
          field: safety.field,
          reason: safety.reason
        });
        return;
      }
    }

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(options?.statusCode ?? 400).json({
        ok: false,
        message: 'Validation failed',
        errors: formatZodErrors(parsed.error)
      });
      return;
    }

    req.body = parsed.data;
    next();
  };
}

export function validateParams<T>(schema: z.ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const safety = assertSafePayload(req.params);
    if (!safety.safe) {
      res.status(400).json({
        ok: false,
        message: 'Potentially malicious parameter detected',
        code: 'SECURITY_INPUT_REJECTED',
        field: safety.field,
        reason: safety.reason
      });
      return;
    }

    const parsed = schema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        message: 'Invalid URL parameters',
        errors: formatZodErrors(parsed.error)
      });
      return;
    }

    req.params = parsed.data as unknown as Request['params'];
    next();
  };
}

export function validateQuery<T>(schema: z.ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const safety = assertSafePayload(req.query);
    if (!safety.safe) {
      res.status(400).json({
        ok: false,
        message: 'Potentially malicious query parameter detected',
        code: 'SECURITY_INPUT_REJECTED',
        field: safety.field,
        reason: safety.reason
      });
      return;
    }

    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        message: 'Invalid query parameters',
        errors: formatZodErrors(parsed.error)
      });
      return;
    }

    req.query = parsed.data as unknown as Request['query'];
    next();
  };
}

// ================= EXPORTED ZOD SCHEMAS FOR M2 ROUTES =================

export const loginSchema = z.object({
  id: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(128),
  role: z.enum(['student', 'faculty', 'admin']).optional()
});

export const stageCartSchema = z.object({
  sectionId: z.string().trim().min(1).max(64)
});

export const sectionIdParamSchema = z.object({
  sectionId: z.string().trim().min(1).max(64)
});

export const petitionSchema = z.object({
  sectionId: z.string().trim().min(1).max(64).optional(),
  courseCode: z.string().trim().min(2).max(32),
  ruleCode: z.string().trim().min(2).max(32),
  reason: z.string().trim().min(5).max(2000)
});

export const waitlistSchema = z.object({
  sectionId: z.string().trim().min(1).max(64)
});

export const solveScheduleSchema = z.object({
  courseCodes: z.array(z.string().trim().min(2).max(32)).max(20).optional(),
  strategy: z.enum(['MilestoneFirst', 'MinimizeGaps']),
  maxCredits: z.number().min(1).max(24).optional()
});

export const enrollConfirmSchema = z
  .object({
    simulateRdsFailure: z.boolean().optional()
  })
  .optional()
  .default({});

export const rdsFallbackSchema = z.object({
  failedSectionId: z.string().trim().min(1).max(64),
  fallbackSectionId: z.string().trim().min(1).max(64)
});

export const exceptionDecisionSchema = z.object({
  caseId: z.string().trim().min(1).max(64),
  action: z.enum(['approve', 'reject', 'flag'])
});

export const expandCapacitySchema = z.object({
  sectionId: z.string().trim().min(1).max(64),
  delta: z.number().int().min(1).max(30)
});

export const createBypassRuleSchema = z.object({
  code: z.string().trim().min(3).max(32),
  title: z.string().trim().min(3).max(255),
  description: z.string().trim().min(5).max(1000),
  category: z
    .enum(['Standing', 'Prerequisite', 'Exam Load', 'Capacity'])
    .optional()
    .default('Standing'),
  enabled: z.boolean()
});

export const toggleRuleSchema = z.object({
  ruleId: z.string().trim().min(1).max(64)
});

export const emergencySectionSchema = z.object({
  courseCode: z.string().trim().min(2).max(32),
  sectionData: z
    .object({
      faculty: z.string().trim().min(2).max(255).optional(),
      days: z.enum(['ST', 'MW', 'RA', 'Thu', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed']).optional(),
      timeSlot: z.string().trim().min(5).max(64).optional(),
      room: z.string().trim().min(2).max(64).optional(),
      capacity: z.number().int().min(1).max(100).optional()
    })
    .optional()
});

export const addSeatsSchema = z.object({
  courseCode: z.string().trim().min(2).max(32),
  count: z.number().int().min(1).max(50)
});

export const rds4SyncSchema = z
  .object({
    snapshots: z
      .array(
        z.object({
          id: z.string().trim().min(1).max(64),
          courseCode: z.string().trim().min(2).max(32),
          courseTitle: z.string().trim().min(2).max(255),
          department: z.enum(['ECE / CSE', 'Math & Physics', 'BBA', 'English & Mod. Lang']),
          credits: z.number().min(0.5).max(6),
          sectionNumber: z.string().trim().min(1).max(16),
          faculty: z.string().trim().min(2).max(255),
          days: z.enum(['ST', 'MW', 'RA', 'Thu', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed']),
          timeSlot: z.string().trim().min(5).max(64),
          room: z.string().trim().min(2).max(64),
          capacity: z.number().int().min(0).max(200),
          enrolled: z.number().int().min(0).max(200),
          waitlisted: z.number().int().min(0).max(500).optional()
        })
      )
      .optional()
  })
  .optional()
  .default({});
