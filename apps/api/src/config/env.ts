import { z, ZodError } from 'zod'
import {
  DEFAULT_AGENT_RATE_LIMIT_MAX,
  DEFAULT_BODY_LIMIT_BYTES,
  DEFAULT_GLOBAL_RATE_LIMIT_MAX,
  DEFAULT_RATE_LIMIT_WINDOW_MS,
  SERVICE_NAME,
  SERVICE_VERSION,
} from './constants.js'

export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

export type NodeEnv = 'development' | 'test' | 'production'
export type LogLevel =
  | 'fatal'
  | 'error'
  | 'warn'
  | 'info'
  | 'debug'
  | 'trace'
  | 'silent'

export interface AppConfig {
  nodeEnv: NodeEnv
  host: string
  port: number
  logLevel: LogLevel
  trustProxy: boolean
  corsOrigins: string[]
  enableApiDocs: boolean
  supabaseUrl: string
  supabasePublishableKey: string
  jwtAudience: string
  jwtIssuer: string
  jwksUrl: string
  serviceName: string
  serviceVersion: string
  bodyLimitBytes: number
  globalRateLimitMax: number
  agentRateLimitMax: number
  rateLimitWindowMs: number
}

const booleanish = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((value) => value === true || value === 'true' || value === '1')

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.preprocess(
    (value) => (value === undefined || value === '' ? 3333 : value),
    z.coerce.number().int().min(1).max(65535),
  ),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  TRUST_PROXY: z.preprocess(
    (value) => (value === undefined || value === '' ? 'false' : value),
    booleanish,
  ),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  ENABLE_API_DOCS: z.preprocess(
    (value) => (value === undefined || value === '' ? 'false' : value),
    booleanish,
  ),
  SUPABASE_URL: z.string().optional().default(''),
  SUPABASE_PUBLISHABLE_KEY: z.string().optional().default(''),
  SUPABASE_JWT_AUDIENCE: z.string().min(1).default('authenticated'),
})

function parseCorsOrigins(raw: string) {
  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)

  if (origins.length === 0) {
    throw new ConfigError('CORS_ORIGINS is required')
  }

  if (origins.includes('*')) {
    throw new ConfigError('CORS_ORIGINS cannot include *')
  }

  return origins
}

function supabaseAuthEndpoints(supabaseUrl: string) {
  if (!supabaseUrl) {
    return { jwtIssuer: '', jwksUrl: '' }
  }

  const base = supabaseUrl.replace(/\/$/, '')
  return {
    jwtIssuer: `${base}/auth/v1`,
    jwksUrl: `${base}/auth/v1/.well-known/jwks.json`,
  }
}

function assertValidUrl(value: string, field: string) {
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new ConfigError(`${field} is invalid`)
    }
  } catch (error) {
    if (error instanceof ConfigError) {
      throw error
    }
    throw new ConfigError(`${field} is invalid`)
  }
}

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  let parsed: z.infer<typeof EnvSchema>

  try {
    parsed = EnvSchema.parse(env)
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ConfigError('Invalid environment configuration')
    }
    throw error
  }

  const corsOrigins = parseCorsOrigins(parsed.CORS_ORIGINS)
  const supabaseUrl = parsed.SUPABASE_URL.trim()
  const supabasePublishableKey = parsed.SUPABASE_PUBLISHABLE_KEY.trim()

  if (parsed.NODE_ENV === 'production') {
    if (!supabaseUrl) {
      throw new ConfigError('SUPABASE_URL is required')
    }
    if (!supabasePublishableKey) {
      throw new ConfigError('SUPABASE_PUBLISHABLE_KEY is required')
    }
  }

  if (supabaseUrl) {
    assertValidUrl(supabaseUrl, 'SUPABASE_URL')
  }

  const { jwtIssuer, jwksUrl } = supabaseAuthEndpoints(supabaseUrl)

  return {
    nodeEnv: parsed.NODE_ENV,
    host: parsed.HOST,
    port: parsed.PORT,
    logLevel: parsed.LOG_LEVEL,
    trustProxy: parsed.TRUST_PROXY,
    corsOrigins,
    enableApiDocs: parsed.ENABLE_API_DOCS,
    supabaseUrl,
    supabasePublishableKey,
    jwtAudience: parsed.SUPABASE_JWT_AUDIENCE,
    jwtIssuer,
    jwksUrl,
    serviceName: SERVICE_NAME,
    serviceVersion: SERVICE_VERSION,
    bodyLimitBytes: DEFAULT_BODY_LIMIT_BYTES,
    globalRateLimitMax: DEFAULT_GLOBAL_RATE_LIMIT_MAX,
    agentRateLimitMax: DEFAULT_AGENT_RATE_LIMIT_MAX,
    rateLimitWindowMs: DEFAULT_RATE_LIMIT_WINDOW_MS,
  }
}
