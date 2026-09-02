import { ApiErrorResponseSchema } from '@destravai/contracts'
import { afterEach, describe, expect, it } from 'vitest'
import { buildTestApp } from './helpers.js'

describe('rate limit', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>> | undefined

  afterEach(async () => {
    if (app) {
      await app.close()
      app = undefined
    }
  })

  it('returns 429 in the API error contract', async () => {
    app = await buildTestApp({
      config: {
        globalRateLimitMax: 2,
        agentRateLimitMax: 10,
      },
    })

    await app.inject({ method: 'GET', url: '/v1/me' })
    await app.inject({ method: 'GET', url: '/v1/me' })
    const limited = await app.inject({ method: 'GET', url: '/v1/me' })

    expect(limited.statusCode).toBe(429)
    const body = ApiErrorResponseSchema.parse(limited.json())
    expect(body.error.code).toBe('RATE_LIMITED')
    expect(body.error.requestId).toBeTruthy()
    expect(limited.headers['x-ratelimit-limit']).toBeDefined()
  })

  it('does not consume the agent quota for health and ready', async () => {
    app = await buildTestApp({
      config: {
        globalRateLimitMax: 2,
        agentRateLimitMax: 2,
      },
    })

    for (let index = 0; index < 5; index += 1) {
      const health = await app.inject({ method: 'GET', url: '/health' })
      const ready = await app.inject({ method: 'GET', url: '/ready' })
      expect(health.statusCode).toBe(200)
      expect(ready.statusCode).toBe(200)
    }
  })

  it('applies a stricter limit to the /v1/agents prefix', async () => {
    app = await buildTestApp({
      config: {
        globalRateLimitMax: 100,
        agentRateLimitMax: 2,
      },
    })

    const first = await app.inject({
      method: 'POST',
      url: '/v1/agents/unlock-task/runs',
      payload: {},
    })
    const second = await app.inject({
      method: 'POST',
      url: '/v1/agents/unlock-task/runs',
      payload: {},
    })
    const third = await app.inject({
      method: 'POST',
      url: '/v1/agents/unlock-task/runs',
      payload: {},
    })

    expect(first.statusCode).toBe(401)
    expect(second.statusCode).toBe(401)
    expect(third.statusCode).toBe(429)
  })
})
