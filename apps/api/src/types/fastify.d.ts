import type { AppConfig } from '../config/env.js'
import type { AuthUser, JwtVerifier } from '../auth/types.js'

declare module 'fastify' {
  interface FastifyInstance {
    appConfig: AppConfig
    jwtVerifier: JwtVerifier
  }

  interface FastifyRequest {
    authUser?: AuthUser | null
  }
}
