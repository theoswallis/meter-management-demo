import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { env } from '../config/env.js';

interface PostgresErrorLike {
  code?: string;
  detail?: string;
  column?: string;
}

export function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply
) {
  // 1. Zod Validation Errors (400 Bad Request)
  if (error instanceof ZodError || error.name === 'ZodError') {
    const zodError = error as ZodError;
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Validation error',
      issues: zodError.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      })),
    });
  }

  // Fastify native schema validation error
  if ((error as FastifyError).validation) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: error.message,
      validation: (error as FastifyError).validation,
    });
  }

  // 2. PostgreSQL Error Codes (generalized by error code rather than specific constraint names)
  const pgError: PostgresErrorLike =
    (error as any)?.cause?.code ? (error as any).cause : (error as any);

  if (pgError.code) {
    switch (pgError.code) {
      // 23505: unique_violation
      case '23505':
        return reply.status(409).send({
          statusCode: 409,
          error: 'Conflict',
          message: 'Duplicate key value violates unique constraint.',
          detail: pgError.detail,
        });

      // 23503: foreign_key_violation
      case '23503': {
        const isReferencedByChild = pgError.detail?.includes('is still referenced');
        const statusCode = isReferencedByChild ? 409 : 400;
        const errorLabel = isReferencedByChild ? 'Conflict' : 'Bad Request';
        return reply.status(statusCode).send({
          statusCode,
          error: errorLabel,
          message: isReferencedByChild
            ? 'Record cannot be deleted or modified because it is referenced by other records.'
            : 'Referenced foreign key record does not exist.',
          detail: pgError.detail,
        });
      }

      // 23514: check_violation
      case '23514':
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Check constraint violation: provided value does not satisfy validation rules.',
          detail: pgError.detail,
        });

      // 23502: not_null_violation
      case '23502':
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: `Not null violation: required field '${pgError.column || 'unknown'}' is missing.`,
        });

      // 22P02: invalid_text_representation
      case '22P02':
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid input syntax or data type representation.',
          detail: pgError.detail,
        });
    }
  }

  // 3. Explicit HTTP Errors (e.g. 404, 401, 403)
  const customStatus = (error as FastifyError).statusCode;
  if (customStatus && customStatus < 500) {
    return reply.status(customStatus).send({
      statusCode: customStatus,
      error: error.name || 'Client Error',
      message: error.message,
    });
  }

  // 4. Fallback 500 Internal Server Error
  request.log.error(error);
  return reply.status(500).send({
    statusCode: 500,
    error: 'Internal Server Error',
    message:
      env.NODE_ENV === 'production'
        ? 'An unexpected server error occurred.'
        : error.message || 'Internal Server Error',
  });
}
