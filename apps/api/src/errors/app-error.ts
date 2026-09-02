export type ApiErrorDetail = {
  path: string
  message: string
}

export class AppError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly details?: ApiErrorDetail[]

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: ApiErrorDetail[],
  ) {
    super(message)
    this.name = 'AppError'
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }

  static validation(details?: ApiErrorDetail[]) {
    return new AppError(400, 'VALIDATION_ERROR', 'Invalid request', details)
  }

  static unauthorized() {
    return new AppError(401, 'UNAUTHORIZED', 'Authentication required')
  }

  static forbidden() {
    return new AppError(403, 'FORBIDDEN', 'Forbidden')
  }

  static notFound() {
    return new AppError(404, 'NOT_FOUND', 'Not found')
  }

  static rateLimited() {
    return new AppError(429, 'RATE_LIMITED', 'Too many requests')
  }

  static quotaExceeded() {
    return new AppError(429, 'AGENT_QUOTA_EXCEEDED', 'Daily agent limit reached')
  }

  static conflict() {
    return new AppError(409, 'CONFLICT', 'Request already in progress')
  }

  static badGateway() {
    return new AppError(502, 'BAD_GATEWAY', 'Upstream provider returned an invalid response')
  }

  static maxTurnsExceeded() {
    return new AppError(
      502,
      'AGENT_MAX_TURNS_EXCEEDED',
      'The agent exceeded the maximum number of turns',
    )
  }

  static serviceUnavailable() {
    return new AppError(503, 'SERVICE_UNAVAILABLE', 'A required dependency is unavailable')
  }

  static gatewayTimeout() {
    return new AppError(504, 'GATEWAY_TIMEOUT', 'The provider timed out')
  }

  static internal() {
    return new AppError(500, 'INTERNAL_ERROR', 'Internal server error')
  }
}

export function isAppError(error: unknown): error is AppError {
  if (error instanceof AppError) {
    return true
  }

  if (typeof error !== 'object' || error === null) {
    return false
  }

  const candidate = error as {
    name?: unknown
    statusCode?: unknown
    code?: unknown
  }
  return (
    candidate.name === 'AppError' &&
    typeof candidate.statusCode === 'number' &&
    typeof candidate.code === 'string'
  )
}
