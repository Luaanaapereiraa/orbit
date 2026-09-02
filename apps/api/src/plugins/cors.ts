import cors from '@fastify/cors'
import type { FastifyInstance } from 'fastify'

export async function registerCors(app: FastifyInstance) {
  const allowlist = new Set(app.appConfig.corsOrigins)

  await app.register(cors, {
    origin(origin, callback) {
      if (!origin) {
        callback(null, false)
        return
      }

      callback(null, allowlist.has(origin))
    },
    credentials: true,
    maxAge: 600,
  })
}
