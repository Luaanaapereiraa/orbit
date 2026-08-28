import { ApiErrorResponseSchema, UnlockTaskRunRequestSchema } from '@destravai/contracts'
import { afterEach, describe, expect, it } from 'vitest'
import { buildTestApp, createLogCapture, testConfig } from './helpers.js'

const validUnlockRequest = UnlockTaskRunRequestSchema.parse({
  clientRequestId: '550e8400-e29b-41d4-a716-446655440000',
  task: {
    id: 'task-1',
    title: 'Escrever testes',
    nextAction: null,
    energy: 'medium',
    estimatedMinutes: 25,
    status: 'inbox',
  },
  blockageReason: 'overwhelmed',
  blockageDetails: null,
  availableMinutes: 30,
  currentEnergy: 'low',
  today: {
    date: '2026-08-28',
    role: 'secondary',
    plannedTaskCount: 2,
  },
  locale: 'pt-BR',
})

describe('errors and validation', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>> | undefined

  afterEach(async () => {
    if (app) {
      await app.close()
      app = undefined
    }
  })

  it('returns 400 for invalid JSON', async () => {
    app = await buildTestApp()
    const response = await app.inject({
      method: 'POST',
      url: '/__test__/validate',
      headers: { 'content-type': 'application/json' },
      payload: '{not-json',
    })
    expect(response.statusCode).toBe(400)
    const body = ApiErrorResponseSchema.parse(response.json())
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.requestId).toBeTruthy()
  })

  it('returns 400 for an invalid unlock request body', async () => {
    app = await buildTestApp()
    const response = await app.inject({
      method: 'POST',
      url: '/__test__/validate',
      payload: {
        ...validUnlockRequest,
        availableMinutes: 1,
      },
    })
    expect(response.statusCode).toBe(400)
    const body = ApiErrorResponseSchema.parse(response.json())
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(
      body.error.details?.some(
        (detail: { path: string }) => detail.path === 'availableMinutes',
      ),
    ).toBe(true)
  })

  it('accepts a valid unlock request body on the test validation route', async () => {
    app = await buildTestApp()
    const response = await app.inject({
      method: 'POST',
      url: '/__test__/validate',
      payload: validUnlockRequest,
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ ok: true })
  })

  it('does not include a stack in production error responses', async () => {
    app = await buildTestApp({
      config: { nodeEnv: 'production' },
    })
    const response = await app.inject({ method: 'GET', url: '/__test__/boom' })
    expect(response.statusCode).toBe(500)
    const body = ApiErrorResponseSchema.parse(response.json())
    expect(body.error.code).toBe('INTERNAL_ERROR')
    expect(JSON.stringify(body)).not.toContain('secret stack')
    expect(body.error).not.toHaveProperty('stack')
  })

  it('does not write authorization tokens to logs', async () => {
    const capture = createLogCapture()
    app = await buildTestApp({
      logger: { level: 'info', stream: capture.stream },
      config: testConfig({ logLevel: 'info' }),
    })

    const secret = 'super-secret-token-value'
    await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: `Bearer ${secret}` },
    })

    const logs = capture.text()
    expect(logs).not.toContain(secret)
    expect(logs.toLowerCase()).not.toContain('super-secret-token-value')
  })
})
