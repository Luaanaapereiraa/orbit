import type { FastifyError, FastifyInstance } from 'fastify'
import { AppError, isAppError } from '../errors/app-error.js'

function errorPayload(
  requestId: string,
  code: string,
  message: string,
  details?: AppError['details'],
) {
  return {
    error: {
      code,
      message,
      requestId,
      ...(details && details.length > 0 ? { details } : {}),
    },
  }
}

function statusCodeOf(error: FastifyError | AppError) {
  if (typeof error.statusCode === 'number' && error.statusCode >= 400) {
    return error.statusCode
  }
  return 500
}

export function registerErrorHandlers(app: FastifyInstance) {
  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send(errorPayload(request.id, 'NOT_FOUND', 'Not found'))
  })

  app.setErrorHandler((error: FastifyError | AppError, request, reply) => {
    const requestId = request.id
    const userId = request.authUser?.id

    if (isAppError(error)) {
      return reply
        .status(error.statusCode)
        .send(
          errorPayload(requestId, error.code, error.message, error.details),
        )
    }

    const statusCode = statusCodeOf(error)

    if (statusCode === 429 || error.code === 'RATE_LIMITED') {
      const code =
        isAppError(error) && error.code === 'AGENT_QUOTA_EXCEEDED'
          ? 'AGENT_QUOTA_EXCEEDED'
          : 'RATE_LIMITED'
      const message =
        code === 'AGENT_QUOTA_EXCEEDED'
          ? 'Daily agent limit reached'
          : 'Too many requests'
      return reply.status(429).send(errorPayload(requestId, code, message))
    }

    if (statusCode === 409) {
      return reply
        .status(409)
        .send(errorPayload(requestId, 'CONFLICT', 'Request already in progress'))
    }

    if (statusCode === 502) {
      return reply
        .status(502)
        .send(
          errorPayload(
            requestId,
            'BAD_GATEWAY',
            'Upstream provider returned an invalid response',
          ),
        )
    }

    if (statusCode === 503) {
      return reply
        .status(503)
        .send(
          errorPayload(
            requestId,
            'SERVICE_UNAVAILABLE',
            'A required dependency is unavailable',
          ),
        )
    }

    if (statusCode === 504) {
      return reply
        .status(504)
        .send(errorPayload(requestId, 'GATEWAY_TIMEOUT', 'The provider timed out'))
    }

    if (statusCode === 401 || error.code === 'UNAUTHORIZED') {
      return reply
        .status(401)
        .send(errorPayload(requestId, 'UNAUTHORIZED', 'Authentication required'))
    }

    if (statusCode === 403) {
      return reply
        .status(403)
        .send(errorPayload(requestId, 'FORBIDDEN', 'Forbidden'))
    }

    if (statusCode === 404) {
      return reply
        .status(404)
        .send(errorPayload(requestId, 'NOT_FOUND', 'Not found'))
    }

    if (statusCode === 400 || error.validation) {
      return reply
        .status(400)
        .send(errorPayload(requestId, 'VALIDATION_ERROR', 'Invalid request'))
    }

    if (app.appConfig.nodeEnv === 'production') {
      request.log.error(
        {
          code: error.code,
          statusCode,
          requestId,
          userId,
        },
        'unhandled error',
      )
    } else {
      request.log.error({ err: error, requestId, userId }, 'unhandled error')
    }

    return reply.status(500).send(
      errorPayload(requestId, 'INTERNAL_ERROR', 'Internal server error'),
    )
  })
}
