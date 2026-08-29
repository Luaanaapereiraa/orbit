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
    OPENAI_MODEL: 'test-model',
    OPENAI_API_KEY: 'sk-test',
    SUPABASE_SECRET_KEY: 'sb_secret_test',
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

  it('requires OPENAI_MODEL outside tests', () => {
    expect(() =>
      loadConfig({
        ...baseEnv,
        OPENAI_MODEL: '',
      }),
    ).toThrow(ConfigError)
  })

  it('rejects sensitive tracing and memory repository in production', () => {
    expect(() =>
      loadConfig({
        ...baseEnv,
        NODE_ENV: 'production',
        OPENAI_TRACE_INCLUDE_SENSITIVE_DATA: 'true',
      }),
    ).toThrow(ConfigError)

    expect(() =>
      loadConfig({
        ...baseEnv,
        NODE_ENV: 'production',
        AGENT_REPOSITORY: 'memory',
      }),
    ).toThrow(ConfigError)
  })

  it('requires a server-only secret when the agent repository is supabase', () => {
    expect(() =>
      loadConfig({
        ...baseEnv,
        NODE_ENV: 'production',
        SUPABASE_SECRET_KEY: '',
      }),
    ).toThrow(ConfigError)

    expect(() =>
      loadConfig({
        ...baseEnv,
        NODE_ENV: 'production',
        SUPABASE_SECRET_KEY: 'sb_publishable_not_a_secret',
      }),
    ).toThrow(ConfigError)

    expect(() =>
      loadConfig({
        ...baseEnv,
        NODE_ENV: 'production',
        SUPABASE_SECRET_KEY: 'pub-key',
      }),
    ).toThrow(ConfigError)

    const leaked = 'sb_secret_must_not_appear'
    try {
      loadConfig({
        ...baseEnv,
        NODE_ENV: 'production',
        SUPABASE_SECRET_KEY: `sb_publishable_${leaked}`,
      })
      throw new Error('expected ConfigError')
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError)
      expect(String(error)).not.toContain(leaked)
    }
  })

  it('allows tests to use the memory repository without a secret', () => {
    const config = loadConfig({
      ...baseEnv,
      NODE_ENV: 'test',
      AGENT_REPOSITORY: 'memory',
      SUPABASE_SECRET_KEY: '',
    })
    expect(config.agentRepository).toBe('memory')
    expect(config.supabaseSecretKey).toBe('')
  })
})
