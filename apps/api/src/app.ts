import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from 'fastify'
import { randomUUID } from 'node:crypto'
import { createRemoteJwksVerifier } from './auth/jwt-verifier.js'
import type { JwtVerifier } from './auth/types.js'
import type { AppConfig } from './config/env.js'
import { AppError } from './errors/app-error.js'
import { parseUnlockTaskRunRequest, zodDetails } from './errors/validation.js'
import { registerCors } from './plugins/cors.js'
import { registerErrorHandlers } from './plugins/error-handler.js'
import { createLoggerOptions } from './plugins/logger.js'
import { registerRateLimit } from './plugins/rate-limit.js'
import { registerSecurityHeaders } from './plugins/security.js'
import { registerOpenApi } from './plugins/swagger.js'
import { registerAgentPrefix } from './routes/agent-prefix.js'
import { registerHealthRoutes } from './routes/health.js'
import { registerMeRoute } from './routes/me.js'

export interface BuildAppOptions {
  config: AppConfig
  jwtVerifier?: JwtVerifier
  logger?: FastifyServerOptions['logger']
  includeTestRoutes?: boolean
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

  app.decorate('appConfig', config)
  app.decorate(
    'jwtVerifier',
    options.jwtVerifier ?? createRemoteJwksVerifier(config),
  )
  app.decorateRequest('authUser', null)
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
  await registerAgentPrefix(app)

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
