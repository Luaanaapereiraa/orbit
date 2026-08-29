import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from 'fastify'
import { randomUUID } from 'node:crypto'
import { createRemoteJwksVerifier } from './auth/jwt-verifier.js'
import type { JwtVerifier } from './auth/types.js'
import type { AppConfig } from './config/env.js'
import { MemoryAgentRunRepository } from './agents/unlock-task/repositories/memory.js'
import type { UnlockAgentRunner } from './agents/unlock-task/runner.js'
import type { ContentModerator } from './agents/unlock-task/guardrails/input.js'
import type { AgentRunRepository } from './agents/unlock-task/repositories/types.js'
import { AppError } from './errors/app-error.js'
import { parseUnlockTaskRunRequest, zodDetails } from './errors/validation.js'
import { registerCors } from './plugins/cors.js'
import { registerErrorHandlers } from './plugins/error-handler.js'
import { createLoggerOptions } from './plugins/logger.js'
import { registerRateLimit } from './plugins/rate-limit.js'
import { registerSecurityHeaders } from './plugins/security.js'
import { registerOpenApi } from './plugins/swagger.js'
import { registerUnlockTaskRoute } from './routes/agents/unlock-task.js'
import { registerHealthRoutes } from './routes/health.js'
import { registerMeRoute } from './routes/me.js'

export interface BuildAppOptions {
  config: AppConfig
  jwtVerifier?: JwtVerifier
  logger?: FastifyServerOptions['logger']
  includeTestRoutes?: boolean
  unlockAgentRunner?: UnlockAgentRunner
  contentModerator?: ContentModerator
  unlockRepositoryFactory?: (input: { userId: string }) => AgentRunRepository
}

function resolveLogger(
  config: AppConfig,
  logger: FastifyServerOptions['logger'] | undefined,
): FastifyServerOptions['logger'] {
  if (logger === false) {
    return false
  }

  const defaults = createLoggerOptions(config)

  if (logger === undefined || logger === true) {
    return defaults
  }

  if (typeof logger === 'object') {
    return {
      ...defaults,
      ...logger,
      redact: defaults.redact,
    }
  }

  return defaults
}

export async function buildApp(
  options: BuildAppOptions,
): Promise<FastifyInstance> {
  const { config } = options
  const app = Fastify({
    logger: resolveLogger(config, options.logger),
    trustProxy: config.trustProxy,
    bodyLimit: config.bodyLimitBytes,
    requestIdHeader: 'x-request-id',
    genReqId: () => randomUUID(),
  })

  // Keep JSON bodies intact (including nulls) so Zod, not AJV, validates contracts.
  app.setValidatorCompiler(() => {
    return (data: unknown) => ({ value: data })
  })
  app.setSerializerCompiler(() => {
    return (data: unknown) => JSON.stringify(data)
  })

  app.decorate('appConfig', config)
  app.decorate(
    'jwtVerifier',
    options.jwtVerifier ?? createRemoteJwksVerifier(config),
  )
  app.decorateRequest('authUser', null)
  if (options.unlockAgentRunner) {
    app.decorate('unlockAgentRunner', options.unlockAgentRunner)
  } else if (config.nodeEnv === 'test') {
    app.decorate('unlockAgentRunner', {
      async run() {
        throw new Error('unlockAgentRunner must be injected in tests')
      },
    } satisfies UnlockAgentRunner)
  }
  if (options.contentModerator) {
    app.decorate('contentModerator', options.contentModerator)
  }
  if (options.unlockRepositoryFactory) {
    app.decorate('unlockRepositoryFactory', options.unlockRepositoryFactory)
  }
  if (config.agentRepository === 'memory') {
    app.decorate(
      'memoryAgentRepository',
      new MemoryAgentRunRepository(() => new Date(), {
        dailyLimit: config.agentDailyLimit,
        leaseMs: config.agentLeaseMs,
      }),
    )
  }
  registerErrorHandlers(app)

  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id)
  })

  await registerSecurityHeaders(app)
  await registerCors(app)
  await registerRateLimit(app)
  await registerOpenApi(app)
  await registerHealthRoutes(app)
  await registerMeRoute(app)
  await registerUnlockTaskRoute(app)

  if (options.includeTestRoutes) {
    app.post('/__test__/validate', async (request) => {
      const parsed = parseUnlockTaskRunRequest(request.body)
      if (!parsed.success) {
        throw AppError.validation(zodDetails(parsed.error))
      }
      return { ok: true }
    })

    app.get('/__test__/boom', async () => {
      throw new Error('secret stack')
    })
  }

  await app.ready()
  return app
}
