// =============================================================================
// src/shared/middleware/validate.ts — Zod validation middleware for dental routers
//
// The dental routers use: validate(SomeZodSchema) as an Express middleware.
// After execution, the parsed body is available on req.validatedBody.
//
// Pattern: validate(schema) → middleware that parses req.body and stores
// the validated result in (req as any).validatedBody.
// On failure, responds with RFC 7807 422 + Zod error details.
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

/**
 * Express middleware factory.
 * Validates req.body against the provided Zod schema.
 * On success: stores result in (req as any).validatedBody and calls next().
 * On failure: responds 422 Unprocessable Entity with RFC 7807 problem detail.
 */
export function validate<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const correlationId = (req as any).correlationId ?? (req as any).requestId ?? 'unknown';
      res.status(422).json({
        type: 'https://api.vytalix.health/errors/validation-failed',
        title: 'Validation Failed',
        status: 422,
        detail: 'Request body failed schema validation',
        correlationId,
        errors: (result.error as ZodError).errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
          code: e.code,
        })),
      });
      return;
    }

    (req as any).validatedBody = result.data;
    next();
  };
}
