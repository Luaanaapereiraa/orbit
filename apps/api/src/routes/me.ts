import type { FastifyInstance } from 'fastify'
import { authenticate } from '../auth/authenticate.js'
import { AppError } from '../errors/app-error.js'
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
        throw AppError.unauthorized()
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
