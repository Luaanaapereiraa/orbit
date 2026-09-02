import type { FastifyInstance } from 'fastify'
import { healthResponseSchema } from '../plugins/openapi-components.js'

function probeBody(
  app: FastifyInstance,
  requestId: string,
  status: 'ok' | 'ready',
) {
  return {
    status,
    service: app.appConfig.serviceName,
    version: app.appConfig.serviceVersion,
    timestamp: new Date().toISOString(),
    requestId,
  }
}

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get(
    '/health',
    {
      schema: {
        tags: ['Health'],
        summary: 'Liveness probe',
        response: {
          200: healthResponseSchema,
        },
      },
    },
    async (request) => probeBody(app, request.id, 'ok'),
  )

  app.get(
    '/ready',
    {
      schema: {
        tags: ['Health'],
        summary: 'Readiness probe',
        description: 'Returns ok when process configuration is loaded.',
        response: {
          200: healthResponseSchema,
        },
      },
    },
    async (request) => probeBody(app, request.id, 'ready'),
  )
}
