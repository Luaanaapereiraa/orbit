import type { FastifyServerOptions } from 'fastify'
import type { AppConfig } from '../config/env.js'

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'req.headers["x-api-key"]',
  'req.headers.apikey',
  'req.headers["x-supabase-key"]',
  'res.headers["set-cookie"]',
  'supabaseSecretKey',
  '*.supabaseSecretKey',
]

export function createLoggerOptions(
  config: AppConfig,
): Exclude<FastifyServerOptions['logger'], boolean | undefined> {
  return {
    level: config.logLevel,
    redact: {
      paths: REDACT_PATHS,
      censor: '[Redacted]',
      remove: false,
    },
    serializers: {
      req(request) {
        return {
          method: request.method,
          url: request.url,
          remoteAddress: request.ip,
        }
      },
    },
  }
}
