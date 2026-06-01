// =============================================================================
// Error Handler Middleware — catches all unhandled errors
// Returns RFC 7807 ProblemDetail for every error type
// =============================================================================

import { Request, Response, NextFunction } from 'express'
import { logger } from '../lib/logger'
import { randomUUID } from 'crypto'

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  const correlationId = (req as any).correlationId ?? randomUUID()
  const statusCode = err.statusCode ?? err.status ?? 500

  // Log server errors; skip logging 4xx (client errors)
  if (statusCode >= 500) {
    logger.error({ err, correlationId, path: req.path }, 'Unhandled server error')
  }

  // Ingestion validation errors
  if (err.name === 'IngestionValidationError') {
    return res.status(422).json({
      type: 'https://api.vytalix.health/errors/validation-failed',
      title: 'Validation Failed',
      status: 422,
      detail: err.message,
      instance: req.path,
      correlationId,
      errors: err.code ? [{ code: err.code, message: err.message, field: '' }] : undefined,
    })
  }

  // Prisma errors
  if (err.code?.startsWith('P2')) {
    const isPrimaryKey = err.code === 'P2002'
    return res.status(isPrimaryKey ? 409 : 400).json({
      type: 'https://api.vytalix.health/errors/database-error',
      title: isPrimaryKey ? 'Conflict' : 'Bad Request',
      status: isPrimaryKey ? 409 : 400,
      detail: isPrimaryKey ? 'Resource already exists' : 'Database constraint violation',
      instance: req.path,
      correlationId,
    })
  }

  // Generic error
  res.status(statusCode).json({
    type: 'https://api.vytalix.health/errors/internal-error',
    title: statusCode === 404 ? 'Not Found' : 'Internal Server Error',
    status: statusCode,
    detail: statusCode < 500 ? err.message : 'An unexpected error occurred',
    instance: req.path,
    correlationId,
  })
}
