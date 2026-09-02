import helmet from '@fastify/helmet'
import type { FastifyInstance } from 'fastify'

export async function registerSecurityHeaders(app: FastifyInstance) {
  await app.register(helmet, {
    global: true,
    contentSecurityPolicy: app.appConfig.enableApiDocs
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'validator.swagger.io'],
          },
        }
      : undefined,
  })
}
