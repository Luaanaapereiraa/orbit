import { ApiErrorResponseSchema, HealthResponseSchema } from '@destravai/contracts'
import { afterEach, describe, expect, it } from 'vitest'
import { buildTestApp } from './helpers.js'

describe('health and ready', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>> | undefined

  afterEach(async () => {
    if (app) {
      await app.close()
      app = undefined
    }
  })

  it('returns a public health payload with a request id', async () => {
    app = await buildTestApp()
    const response = await app.inject({ method: 'GET', url: '/health' })
    expect(response.statusCode).toBe(200)

    const body = HealthResponseSchema.parse(response.json())
    expect(body.status).toBe('ok')
    expect(body.service).toBe('destravai-api')
    expect(body.version).toBe('0.0.0')
    expect(body.requestId).toEqual(response.headers['x-request-id'])
    expect(body).not.toHaveProperty('host')
    expect(body).not.toHaveProperty('stack')
    expect(JSON.stringify(body)).not.toMatch(/SUPABASE|process\.env|example\.supabase/)
  })

  it('reuses a client request id', async () => {
    app = await buildTestApp()
    const requestId = '11111111-1111-4111-8111-111111111111'
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': requestId },
    })
    expect(response.json().requestId).toBe(requestId)
    expect(response.headers['x-request-id']).toBe(requestId)
  })

  it('returns ready when configuration is loaded', async () => {
    app = await buildTestApp()
    const response = await app.inject({ method: 'GET', url: '/ready' })
    expect(response.statusCode).toBe(200)
    const body = HealthResponseSchema.parse(response.json())
    expect(body.status).toBe('ready')
    expect(body.requestId).toBeTruthy()
  })

  it('returns a contract 404', async () => {
    app = await buildTestApp()
    const response = await app.inject({ method: 'GET', url: '/missing' })
    expect(response.statusCode).toBe(404)
    const body = ApiErrorResponseSchema.parse(response.json())
    expect(body.error.code).toBe('NOT_FOUND')
    expect(body.error.requestId).toBeTruthy()
    expect(body.error).not.toHaveProperty('stack')
  })
})
