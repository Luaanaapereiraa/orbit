import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import type { FastifyInstance } from 'fastify'
import { openApiComponents } from './openapi-components.js'

export async function registerOpenApi(app: FastifyInstance) {
  const { nodeEnv, enableApiDocs, serviceVersion } = app.appConfig
  const exposeSpec = nodeEnv !== 'production' || enableApiDocs

  if (!exposeSpec) {
    return
  }

  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'DestravAI API',
        version: serviceVersion,
        description:
          'HTTP API for DestravAI, including the authenticated unlock-task agent.',
      },
      tags: [
        { name: 'Health', description: 'Liveness and readiness probes' },
        { name: 'Auth', description: 'Authenticated identity' },
        {
          name: 'Agent',
          description: 'Unlock-task agent. Generates a short executable plan.',
        },
      ],
      components: openApiComponents as never,
    },
  })

  if (!enableApiDocs) {
    return
  }

  await app.register(swaggerUi, {
    routePrefix: '/documentation',
    uiConfig: {
      docExpansion: 'list',
      persistAuthorization: false,
    },
  })
}
