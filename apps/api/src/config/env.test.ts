import { describe, expect, it } from 'vitest'
import { ConfigError, loadConfig } from '../config/env.js'

describe('loadConfig', () => {
  const baseEnv = {
    NODE_ENV: 'development',
    HOST: '127.0.0.1',
    PORT: '3333',
    LOG_LEVEL: 'info',
    TRUST_PROXY: 'false',
    CORS_ORIGINS: 'http://localhost:3000',
    ENABLE_API_DOCS: 'true',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'pub-key',
    SUPABASE_JWT_AUDIENCE: 'authenticated',
  }

  it('parses development env and boolean false', () => {
    const config = loadConfig(baseEnv)
    expect(config.trustProxy).toBe(false)
    expect(config.enableApiDocs).toBe(true)
    expect(config.corsOrigins).toEqual(['http://localhost:3000'])
    expect(config.jwtIssuer).toBe('https://example.supabase.co/auth/v1')
    expect(config.jwksUrl).toBe(
      'https://example.supabase.co/auth/v1/.well-known/jwks.json',
    )
  })

  it('fails production when required values are missing', () => {
    expect(() =>
      loadConfig({
        ...baseEnv,
        NODE_ENV: 'production',
        SUPABASE_URL: '',
        SUPABASE_PUBLISHABLE_KEY: '',
      }),
    ).toThrow(ConfigError)
  })

  it('rejects a wildcard CORS origin', () => {
    expect(() => loadConfig({ ...baseEnv, CORS_ORIGINS: '*' })).toThrow(
      ConfigError,
    )
  })
})
