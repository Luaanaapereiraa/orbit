import type { FastifyInstance } from 'fastify'
import { AppError } from '../errors/app-error.js'

export async function registerAgentPrefix(app: FastifyInstance) {
  await app.register(async (scope) => {
    scope.route({
      method: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
      url: '/*',
      schema: { hide: true },
      handler: async () => {
        throw AppError.notFound()
      },
    })
  }, { prefix: '/v1/agents' })
}
