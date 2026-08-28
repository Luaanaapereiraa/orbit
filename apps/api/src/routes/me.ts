import type { FastifyInstance } from 'fastify'
import { authenticate } from '../auth/authenticate.js'
import {
  apiErrorResponseSchema,
  meResponseSchema,
} from '../plugins/openapi-components.js'

export async function registerMeRoute(app: FastifyInstance) {
  app.get(
    '/v1/me',
    {
      preHandler: authenticate,
      schema: {
        tags: ['Auth'],
        summary: 'Current user',
        security: [{ bearerAuth: [] }],
        response: {
          200: meResponseSchema,
          401: apiErrorResponseSchema,
        },
      },
    },
    async (request) => {
      const user = request.authUser

      if (!user) {
        throw new Error('Missing auth context')
      }

      return {
        user: {
          id: user.id,
          isAnonymous: user.isAnonymous,
        },
      }
    },
  )
}
