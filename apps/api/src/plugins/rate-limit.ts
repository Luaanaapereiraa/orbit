import rateLimit from '@fastify/rate-limit'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { AppError } from '../errors/app-error.js'

function requestPath(request: FastifyRequest) {
  return request.url.split('?')[0] ?? request.url
}

function isProbePath(path: string) {
  return path === '/health' || path === '/ready'
}

function isAgentPath(path: string) {
  return path === '/v1/agents' || path.startsWith('/v1/agents/')
}

export async function registerRateLimit(app: FastifyInstance) {
  const { globalRateLimitMax, agentRateLimitMax, rateLimitWindowMs } =
    app.appConfig

  await app.register(rateLimit, {
    global: true,
    hook: 'onRequest',
    timeWindow: rateLimitWindowMs,
    skipOnError: true,
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
      'retry-after': true,
    },
    allowList: (request) => isProbePath(requestPath(request)),
    keyGenerator: (request) => {
      const path = requestPath(request)
      const ip = request.ip || 'unknown'
      return isAgentPath(path) ? `agent:${ip}` : `global:${ip}`
    },
    max: (request) =>
      isAgentPath(requestPath(request)) ? agentRateLimitMax : globalRateLimitMax,
    errorResponseBuilder: () => AppError.rateLimited(),
  })
}
