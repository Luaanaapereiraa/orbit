import {
  ApiErrorResponseSchema,
  UnlockTaskRunResponseSchema,
} from '@destravai/contracts'
import { afterEach, describe, expect, it } from 'vitest'
import { FailingModerator, PatternModerator, type ContentModerator } from '../agents/unlock-task/guardrails/input.js'
import {
  AgentProviderError,
  AgentProtocolError,
  AgentTimeoutError,
  type UnlockAgentRunner,
} from '../agents/unlock-task/runner.js'
import { MemoryAgentRunRepository } from '../agents/unlock-task/repositories/memory.js'
import {
  buildTestApp,
  createCompletedRunner,
  createLogCapture,
  createTestVerifier,
  signTestJwt,
  validUnlockPlan,
  validUnlockRequest,
} from './helpers.js'

const USER_ID = '11111111-1111-4111-8111-111111111111'

describe('POST /v1/agents/unlock-task/runs', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>> | undefined

  afterEach(async () => {
    if (app) {
      await app.close()
      app = undefined
    }
  })

  async function setup(options: {
    runner?: UnlockAgentRunner
    moderator?: ContentModerator
    repository?: MemoryAgentRunRepository
    extra?: Parameters<typeof buildTestApp>[0]
  } = {}) {
    const keys = await createTestVerifier()
    const repository = options.repository ?? new MemoryAgentRunRepository()
    const token = await signTestJwt(keys.privateKey, { subject: USER_ID })
    const server = await buildTestApp({
      jwtVerifier: keys.verifier,
      unlockAgentRunner: options.runner ?? createCompletedRunner(),
      contentModerator: options.moderator ?? new PatternModerator(),
      unlockRepositoryFactory: () => repository,
      ...options.extra,
    })
    app = server
    return { token, repository, server }
  }

  it('requires authentication', async () => {
    const keys = await createTestVerifier()
    app = await buildTestApp({
      jwtVerifier: keys.verifier,
      unlockAgentRunner: createCompletedRunner(),
    })
    const response = await app.inject({
      method: 'POST',
      url: '/v1/agents/unlock-task/runs',
      payload: validUnlockRequest(),
    })
    expect(response.statusCode).toBe(401)
    const body = ApiErrorResponseSchema.parse(response.json())
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  it('rejects an invalid body', async () => {
    const { token, server } = await setup()
    const response = await server.inject({
      method: 'POST',
      url: '/v1/agents/unlock-task/runs',
      headers: { authorization: `Bearer ${token}` },
      payload: { ...validUnlockRequest(), availableMinutes: 1 },
    })
    expect(response.statusCode).toBe(400)
    const body = ApiErrorResponseSchema.parse(response.json())
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects unknown fields including client-supplied userId', async () => {
    const { token, server } = await setup()
    const response = await server.inject({
      method: 'POST',
      url: '/v1/agents/unlock-task/runs',
      headers: { authorization: `Bearer ${token}` },
      payload: { ...validUnlockRequest(), userId: 'attacker' },
    })
    expect(response.statusCode).toBe(400)
  })

  it('returns a completed discriminated response', async () => {
    const plan = validUnlockPlan()
    const { token, server } = await setup({ runner: createCompletedRunner(plan) })
    const response = await server.inject({
      method: 'POST',
      url: '/v1/agents/unlock-task/runs',
      headers: { authorization: `Bearer ${token}` },
      payload: validUnlockRequest(),
    })
    expect(response.statusCode).toBe(200)
    const body = UnlockTaskRunResponseSchema.parse(response.json())
    expect(body.status).toBe('completed')
    if (body.status === 'completed') {
      expect(body.generationMode).toBe('agent')
      expect(body.plan).toEqual(plan)
      expect(body.promptVersion).toBe('unlock-v1')
    }
  })

  it('returns needs_clarification', async () => {
    const runner: UnlockAgentRunner = {
      async run() {
        return {
          output: {
            status: 'needs_clarification',
            question: 'Qual e o primeiro slide que voce precisa abrir?',
          },
        }
      },
    }
    const { token, server } = await setup({ runner })
    const response = await server.inject({
      method: 'POST',
      url: '/v1/agents/unlock-task/runs',
      headers: { authorization: `Bearer ${token}` },
      payload: validUnlockRequest(),
    })
    expect(response.statusCode).toBe(200)
    const body = UnlockTaskRunResponseSchema.parse(response.json())
    expect(body.status).toBe('needs_clarification')
  })

  it('returns a safety rejection for crisis content', async () => {
    const { token, server } = await setup()
    const response = await server.inject({
      method: 'POST',
      url: '/v1/agents/unlock-task/runs',
      headers: { authorization: `Bearer ${token}` },
      payload: validUnlockRequest({
        task: {
          ...validUnlockRequest().task,
          title: 'Quero me matar hoje',
        },
      }),
    })
    expect(response.statusCode).toBe(200)
    const body = UnlockTaskRunResponseSchema.parse(response.json())
    expect(body.status).toBe('rejected')
    if (body.status === 'rejected') {
      expect(body.reason).toBe('safety')
    }
  })

  it('replays a completed idempotent request', async () => {
    const { token, server } = await setup()
    const payload = validUnlockRequest()
    const first = await server.inject({
      method: 'POST',
      url: '/v1/agents/unlock-task/runs',
      headers: { authorization: `Bearer ${token}` },
      payload,
    })
    const second = await server.inject({
      method: 'POST',
      url: '/v1/agents/unlock-task/runs',
      headers: { authorization: `Bearer ${token}` },
      payload,
    })
    expect(first.statusCode).toBe(200)
    expect(second.statusCode).toBe(200)
    expect(second.json()).toEqual(first.json())
  })

  it('returns 409 when the same request is still running', async () => {
    const repository = new MemoryAgentRunRepository()
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const blockedRunner: UnlockAgentRunner = {
      async run(context) {
        await gate
        return createCompletedRunner().run(context)
      },
    }
    const { token, server } = await setup({
      runner: blockedRunner,
      repository,
    })
    const payload = validUnlockRequest()
    const pending = server.inject({
      method: 'POST',
      url: '/v1/agents/unlock-task/runs',
      headers: { authorization: `Bearer ${token}` },
      payload,
    })
    await new Promise((resolve) => setTimeout(resolve, 20))
    const conflicted = await server.inject({
      method: 'POST',
      url: '/v1/agents/unlock-task/runs',
      headers: { authorization: `Bearer ${token}` },
      payload,
    })
    expect(conflicted.statusCode).toBe(409)
    const body = ApiErrorResponseSchema.parse(conflicted.json())
    expect(body.error.code).toBe('CONFLICT')
    release()
    const finished = await pending
    expect(finished.statusCode).toBe(200)
  })

  it('returns 429 when the daily quota is exceeded', async () => {
    const repository = new MemoryAgentRunRepository()
    const { token, server } = await setup({
      repository,
      extra: { config: { agentDailyLimit: 1 } },
    })
    const first = await server.inject({
      method: 'POST',
      url: '/v1/agents/unlock-task/runs',
      headers: { authorization: `Bearer ${token}` },
      payload: validUnlockRequest({
        clientRequestId: '550e8400-e29b-41d4-a716-446655440001',
      }),
    })
    const second = await server.inject({
      method: 'POST',
      url: '/v1/agents/unlock-task/runs',
      headers: { authorization: `Bearer ${token}` },
      payload: validUnlockRequest({
        clientRequestId: '550e8400-e29b-41d4-a716-446655440002',
      }),
    })
    expect(first.statusCode).toBe(200)
    expect(second.statusCode).toBe(429)
    const body = ApiErrorResponseSchema.parse(second.json())
    expect(body.error.code).toBe('AGENT_QUOTA_EXCEEDED')
  })

  it('returns 502 when the agent protocol is invalid', async () => {
    const runner: UnlockAgentRunner = {
      async run() {
        throw new AgentProtocolError()
      },
    }
    const { token, server } = await setup({ runner })
    const response = await server.inject({
      method: 'POST',
      url: '/v1/agents/unlock-task/runs',
      headers: { authorization: `Bearer ${token}` },
      payload: validUnlockRequest(),
    })
    expect(response.statusCode).toBe(502)
    expect(ApiErrorResponseSchema.parse(response.json()).error.code).toBe(
      'BAD_GATEWAY',
    )
  })

  it('returns 503 when moderation fails closed', async () => {
    const { token, server } = await setup({ moderator: new FailingModerator() })
    const response = await server.inject({
      method: 'POST',
      url: '/v1/agents/unlock-task/runs',
      headers: { authorization: `Bearer ${token}` },
      payload: validUnlockRequest(),
    })
    expect(response.statusCode).toBe(503)
    expect(ApiErrorResponseSchema.parse(response.json()).error.code).toBe(
      'SERVICE_UNAVAILABLE',
    )
  })

  it('uses fallback on timeout and does not pretend it was the agent', async () => {
    const runner: UnlockAgentRunner = {
      async run(context) {
        context.cancelled = true
        throw new AgentTimeoutError()
      },
    }
    const { token, server } = await setup({ runner })
    const response = await server.inject({
      method: 'POST',
      url: '/v1/agents/unlock-task/runs',
      headers: { authorization: `Bearer ${token}` },
      payload: validUnlockRequest(),
    })
    expect(response.statusCode).toBe(200)
    const body = UnlockTaskRunResponseSchema.parse(response.json())
    expect(body.status).toBe('completed')
    if (body.status === 'completed') {
      expect(body.generationMode).toBe('fallback')
      expect(body.plan.steps).toHaveLength(2)
      expect(body.plan.totalMinutes).toBeLessThanOrEqual(20)
    }
  })

  it('uses fallback when the provider is unavailable', async () => {
    const runner: UnlockAgentRunner = {
      async run() {
        throw new AgentProviderError()
      },
    }
    const { token, server } = await setup({ runner })
    const response = await server.inject({
      method: 'POST',
      url: '/v1/agents/unlock-task/runs',
      headers: { authorization: `Bearer ${token}` },
      payload: validUnlockRequest(),
    })
    const body = UnlockTaskRunResponseSchema.parse(response.json())
    expect(body.status).toBe('completed')
    if (body.status === 'completed') {
      expect(body.generationMode).toBe('fallback')
    }
  })

  it('does not use fallback for a safety rejection', async () => {
    const runner: UnlockAgentRunner = {
      async run() {
        throw new AgentTimeoutError()
      },
    }
    const { token, server } = await setup({ runner })
    const response = await server.inject({
      method: 'POST',
      url: '/v1/agents/unlock-task/runs',
      headers: { authorization: `Bearer ${token}` },
      payload: validUnlockRequest({
        task: {
          ...validUnlockRequest().task,
          title: 'kill myself tonight',
        },
      }),
    })
    const body = UnlockTaskRunResponseSchema.parse(response.json())
    expect(body.status).toBe('rejected')
  })

  it('does not log token, task title or raw body', async () => {
    const capture = createLogCapture()
    const keys = await createTestVerifier()
    const token = await signTestJwt(keys.privateKey, { subject: USER_ID })
    const title = 'SECRET_TASK_TITLE_XYZ'
    app = await buildTestApp({
      jwtVerifier: keys.verifier,
      unlockAgentRunner: createCompletedRunner(),
      logger: { level: 'info', stream: capture.stream },
      config: { logLevel: 'info' },
    })
    await app.inject({
      method: 'POST',
      url: '/v1/agents/unlock-task/runs',
      headers: { authorization: `Bearer ${token}` },
      payload: validUnlockRequest({
        task: { ...validUnlockRequest().task, title },
      }),
    })
    const logs = capture.text()
    expect(logs).not.toContain(token)
    expect(logs).not.toContain(title)
    expect(logs).not.toContain('dont_know_where_to_start')
  })

  it('exposes the route in OpenAPI', async () => {
    const keys = await createTestVerifier()
    app = await buildTestApp({
      jwtVerifier: keys.verifier,
      unlockAgentRunner: createCompletedRunner(),
      config: { enableApiDocs: true },
    })
    const spec = app.swagger()
    const unlockPath = spec.paths?.['/v1/agents/unlock-task/runs']?.post
    expect(unlockPath).toBeDefined()
    expect(unlockPath?.security).toEqual([{ bearerAuth: [] }])
  })
})
