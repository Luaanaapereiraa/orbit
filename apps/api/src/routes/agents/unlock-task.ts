import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../auth/authenticate.js'
import { UnlockTaskService } from '../../agents/unlock-task/service.js'
import { createSdkUnlockAgentRunner } from '../../agents/unlock-task/runner.js'
import {
  createSupabaseUserClient,
  SupabaseAgentRunRepository,
} from '../../agents/unlock-task/repositories/supabase.js'
import { AppError } from '../../errors/app-error.js'
import { parseUnlockTaskRunRequest, zodDetails } from '../../errors/validation.js'
import {
  apiErrorResponseSchema,
  unlockTaskRunRequestSchema,
} from '../../plugins/openapi-components.js'

export async function registerUnlockTaskRoute(app: FastifyInstance) {
  app.post(
    '/v1/agents/unlock-task/runs',
    {
      preHandler: authenticate,
      schema: {
        tags: ['Agent'],
        summary: 'Generate a short unlock plan for a blocked task',
        security: [{ bearerAuth: [] }],
        body: unlockTaskRunRequestSchema,
        response: {
          200: { type: 'object', additionalProperties: true },
          400: apiErrorResponseSchema,
          401: apiErrorResponseSchema,
          409: apiErrorResponseSchema,
          429: apiErrorResponseSchema,
          502: apiErrorResponseSchema,
          503: apiErrorResponseSchema,
          504: apiErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const parsed = parseUnlockTaskRunRequest(request.body)
      if (!parsed.success) {
        throw AppError.validation(zodDetails(parsed.error))
      }

      const user = request.authUser
      if (!user) {
        throw AppError.unauthorized()
      }

      const header = request.headers.authorization ?? ''
      const token = header.startsWith('Bearer ') ? header.slice(7) : ''
      const repository =
        app.unlockRepositoryFactory?.({ userId: user.id, accessToken: token }) ??
        defaultRepository(app, token)

      const runner = app.unlockAgentRunner ?? createSdkUnlockAgentRunner(app.appConfig)
      const service = new UnlockTaskService({
        config: app.appConfig,
        repository,
        runner,
        moderator: app.contentModerator,
        log: {
          info: (payload, message) => request.log.info(payload, message),
          error: (payload, message) => request.log.error(payload, message),
        },
      })

      const result = await service.execute({
        userId: user.id,
        request: parsed.data,
        requestId: request.id,
      })
      return reply.status(200).send(result)
    },
  )
}

function defaultRepository(app: FastifyInstance, accessToken: string) {
  if (app.appConfig.agentRepository === 'memory') {
    if (!app.memoryAgentRepository) {
      throw AppError.internal()
    }
    return app.memoryAgentRepository
  }

  return new SupabaseAgentRunRepository(
    createSupabaseUserClient(app.appConfig, accessToken),
  )
}

