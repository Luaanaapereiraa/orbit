import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ApiErrorResponseSchema,
  UnlockTaskRunResponseSchema,
} from '@destravai/contracts'
import {
  AgentMaxTurnsError,
  AgentProtocolError,
  AgentTimeoutError,
  unlockRunOptions,
} from '../agents/unlock-task/runner.js'
import { InvalidRunTransitionError } from '../agents/unlock-task/repositories/types.js'
import { MemoryAgentRunRepository } from '../agents/unlock-task/repositories/memory.js'
import { createUnlockRunContext } from '../agents/unlock-task/context.js'
import { buildFallbackPlan } from '../agents/unlock-task/fallback.js'
import { safetyRejectionMessage } from '../agents/unlock-task/guardrails/input.js'
import {
  buildTestApp,
  createCompletedRunner,
  createTestVerifier,
  signTestJwt,
  testConfig,
  validUnlockPlan,
  validUnlockRequest,
} from './helpers.js'
import type { UnlockAgentRunner } from '../agents/unlock-task/runner.js'
import type { AgentRunRepository } from '../agents/unlock-task/repositories/types.js'

const USER_ID = '11111111-1111-4111-8111-111111111111'

describe('unlock-task arbitration, lease, errors and OpenAPI', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>> | undefined

  afterEach(async () => {
    if (app) {
      await app.close()
      app = undefined
    }
  })

  async function setup(options: {
    runner?: UnlockAgentRunner
    repository?: MemoryAgentRunRepository
  } = {}) {
    const keys = await createTestVerifier()
    const repository = options.repository ?? new MemoryAgentRunRepository()
    const token = await signTestJwt(keys.privateKey, { subject: USER_ID })
    const server = await buildTestApp({
      jwtVerifier: keys.verifier,
      unlockAgentRunner: options.runner ?? createCompletedRunner(),
      unlockRepositoryFactory: () => repository,
    })
    app = server
    return { token, repository, server }
  }

  it('passes AbortSignal through unlockRunOptions', () => {
    const controller = new AbortController()
    const options = unlockRunOptions(
      testConfig(),
      createUnlockRunContext({
        runId: 'run',
        userId: USER_ID,
        request: validUnlockRequest(),
        repository: new MemoryAgentRunRepository(),
      }),
      controller.signal,
    )
    expect(options.signal).toBe(controller.signal)
    const source = readFileSync(
      resolve(process.cwd(), 'src/agents/unlock-task/runner.ts'),
      'utf8',
    )
    expect(source).toMatch(/new AbortController/)
    expect(source).toMatch(/controller\.abort\(/)
    expect(source).toMatch(/signal: options\.signal/)
    expect(source).toMatch(/sdkPromise\.catch/)
  })

  it('returns 502 AGENT_MAX_TURNS_EXCEEDED without fallback', async () => {
    const repository = new MemoryAgentRunRepository()
    const { token, server } = await setup({
      repository,
      runner: {
        async run() {
          throw new AgentMaxTurnsError()
        },
      },
    })
    const response = await server.inject({
      method: 'POST',
      url: '/v1/agents/unlock-task/runs',
      headers: { authorization: `Bearer ${token}` },
      payload: validUnlockRequest(),
    })
    expect(response.statusCode).toBe(502)
    expect(ApiErrorResponseSchema.parse(response.json()).error.code).toBe(
      'AGENT_MAX_TURNS_EXCEEDED',
    )
    const stored = repository.peek(USER_ID, validUnlockRequest().clientRequestId)
    expect(stored?.status).toBe('failed')
    expect(stored?.generationMode).not.toBe('fallback')
  })

  it('does not fallback on protocol errors', async () => {
    const { token, server } = await setup({
      runner: {
        async run() {
          throw new AgentProtocolError()
        },
      },
    })
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

  it('does not fallback on repository errors', async () => {
    const repository = new MemoryAgentRunRepository()
    const failing: AgentRunRepository = {
      startRun: (input) => repository.startRun(input),
      savePlan: async () => {
        throw new Error('db_down')
      },
      beginFallback: (input) => repository.beginFallback(input),
      finishRun: (input) => repository.finishRun(input),
      getPlanByRunId: (input) => repository.getPlanByRunId(input),
      getRun: (input) => repository.getRun(input),
    }
    const keys = await createTestVerifier()
    const token = await signTestJwt(keys.privateKey, { subject: USER_ID })
    app = await buildTestApp({
      jwtVerifier: keys.verifier,
      unlockAgentRunner: createCompletedRunner(),
      unlockRepositoryFactory: () => failing,
    })
    const response = await app.inject({
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

  it('returns 504 when fallback cannot be persisted after timeout', async () => {
    const repository = new MemoryAgentRunRepository()
    const failing: AgentRunRepository = {
      startRun: (input) => repository.startRun(input),
      savePlan: async (input) => {
        if (input.generationMode === 'fallback') {
          throw new Error('fallback_save_failed')
        }
        return repository.savePlan(input)
      },
      beginFallback: (input) => repository.beginFallback(input),
      finishRun: (input) => repository.finishRun(input),
      getPlanByRunId: (input) => repository.getPlanByRunId(input),
      getRun: (input) => repository.getRun(input),
    }
    const keys = await createTestVerifier()
    const token = await signTestJwt(keys.privateKey, { subject: USER_ID })
    app = await buildTestApp({
      jwtVerifier: keys.verifier,
      unlockAgentRunner: {
        async run() {
          throw new AgentTimeoutError()
        },
      },
      unlockRepositoryFactory: () => failing,
    })
    const response = await app.inject({
      method: 'POST',
      url: '/v1/agents/unlock-task/runs',
      headers: { authorization: `Bearer ${token}` },
      payload: validUnlockRequest(),
    })
    expect(response.statusCode).toBe(504)
    expect(ApiErrorResponseSchema.parse(response.json()).error.code).toBe(
      'GATEWAY_TIMEOUT',
    )
  })

  it('blocks a late agent save after timeout wins arbitration', async () => {
    const repository = new MemoryAgentRunRepository()
    const started = await repository.startRun({
      userId: USER_ID,
      clientRequestId: validUnlockRequest().clientRequestId,
      blockageReason: 'dont_know_where_to_start',
      promptVersion: 'unlock-v1',
      dailyLimit: 5,
    })
    if (started.kind !== 'created') {
      throw new Error('expected created')
    }
    const timeout = await repository.beginFallback({
      runId: started.run.id,
      userId: USER_ID,
    })
    expect(timeout.kind).toBe('fallback_claimed')
    const late = await repository.savePlan({
      runId: started.run.id,
      userId: USER_ID,
      plan: validUnlockPlan(),
      generationMode: 'agent',
    })
    expect(late.kind).toBe('rejected')
  })

  it('returns the persisted agent plan instead of a diverging fallback', async () => {
    const repository = new MemoryAgentRunRepository()
    const plan = validUnlockPlan()
    const { token, server } = await setup({
      repository,
      runner: {
        async run(context) {
          await createCompletedRunner(plan).run(context)
          throw new AgentTimeoutError()
        },
      },
    })
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
      const stored = await repository.getPlanByRunId({
        runId: body.runId,
        userId: USER_ID,
      })
      expect(stored?.plan).toEqual(plan)
    }
  })

  it('returns the same fallback plan that was persisted', async () => {
    const { token, server } = await setup({
      runner: {
        async run() {
          throw new AgentTimeoutError()
        },
      },
    })
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
      expect(body.plan).toEqual(buildFallbackPlan(validUnlockRequest()))
      expect(body.plan.supportiveMessage).toContain('Você')
    }
  })

  it('rejects invalid transitions such as completed to failed', async () => {
    const repository = new MemoryAgentRunRepository()
    const started = await repository.startRun({
      userId: USER_ID,
      clientRequestId: validUnlockRequest().clientRequestId,
      blockageReason: 'dont_know_where_to_start',
      promptVersion: 'unlock-v1',
    })
    if (started.kind !== 'created') {
      throw new Error('expected created')
    }
    await repository.finishRun({
      runId: started.run.id,
      userId: USER_ID,
      status: 'completed',
      response: {
        status: 'completed',
        runId: started.run.id,
        promptVersion: 'unlock-v1',
        generationMode: 'agent',
        createdAt: '2026-08-28T18:00:00.000Z',
        plan: validUnlockPlan(),
      },
      plan: validUnlockPlan(),
      generationMode: 'agent',
      promptVersion: 'unlock-v1',
    })
    await expect(
      repository.finishRun({
        runId: started.run.id,
        userId: USER_ID,
        status: 'failed',
        response: null,
        promptVersion: 'unlock-v1',
      }),
    ).rejects.toBeInstanceOf(InvalidRunTransitionError)
  })

  it('conflicts while the lease is valid and recovers after expiry without extra quota', async () => {
    const repository = new MemoryAgentRunRepository()
    const input = {
      userId: USER_ID,
      clientRequestId: validUnlockRequest().clientRequestId,
      blockageReason: 'dont_know_where_to_start' as const,
      promptVersion: 'unlock-v1',
      dailyLimit: 5,
    }
    const first = await repository.startRun(input)
    expect(first.kind).toBe('created')
    const conflict = await repository.startRun(input)
    expect(conflict.kind).toBe('in_progress')
    expect(repository.quotaUsed(USER_ID)).toBe(1)

    repository.expireLease(USER_ID, input.clientRequestId)
    const recovered = await repository.startRun(input)
    expect(recovered.kind).toBe('created')
    if (recovered.kind === 'created') {
      expect(recovered.run.status).toBe('running')
    }
    expect(repository.quotaUsed(USER_ID)).toBe(1)
  })

  it('recovers an expired fallback_pending lease without returning to running', async () => {
    const repository = new MemoryAgentRunRepository()
    const input = {
      userId: USER_ID,
      clientRequestId: validUnlockRequest().clientRequestId,
      blockageReason: 'dont_know_where_to_start' as const,
      promptVersion: 'unlock-v1',
      dailyLimit: 5,
    }
    const first = await repository.startRun(input)
    if (first.kind !== 'created') {
      throw new Error('expected created')
    }
    const claimed = await repository.beginFallback({
      runId: first.run.id,
      userId: USER_ID,
    })
    expect(claimed.kind).toBe('fallback_claimed')
    repository.expireLease(USER_ID, input.clientRequestId)
    const recovered = await repository.startRun(input)
    expect(recovered.kind).toBe('created')
    if (recovered.kind !== 'created') {
      throw new Error('expected recovered fallback')
    }
    expect(recovered.run.status).toBe('fallback_pending')
    expect(repository.quotaUsed(USER_ID)).toBe(1)

    const lateAgent = await repository.savePlan({
      runId: recovered.run.id,
      userId: USER_ID,
      plan: validUnlockPlan(),
      generationMode: 'agent',
    })
    expect(lateAgent.kind).toBe('rejected')

    const fallback = await repository.savePlan({
      runId: recovered.run.id,
      userId: USER_ID,
      plan: validUnlockPlan(),
      generationMode: 'fallback',
    })
    expect(fallback.kind).toBe('saved')
  })

  it('recovers an expired fallback_pending lease with a single winner', async () => {
    const repository = new MemoryAgentRunRepository()
    const input = {
      userId: USER_ID,
      clientRequestId: validUnlockRequest().clientRequestId,
      blockageReason: 'dont_know_where_to_start' as const,
      promptVersion: 'unlock-v1',
    }
    const first = await repository.startRun(input)
    if (first.kind !== 'created') {
      throw new Error('expected created')
    }
    await repository.beginFallback({ runId: first.run.id, userId: USER_ID })
    repository.expireLease(USER_ID, input.clientRequestId)
    const [a, b] = await Promise.all([
      repository.startRun(input),
      repository.startRun(input),
    ])
    const kinds = [a.kind, b.kind].sort()
    expect(kinds).toEqual(['created', 'in_progress'])
    const recovered = a.kind === 'created' ? a.run : b.kind === 'created' ? b.run : null
    expect(recovered?.status).toBe('fallback_pending')
    expect(repository.quotaUsed(USER_ID)).toBe(1)
  })

  it('classifies an existing agent plan as persisted_plan_won with agent mode', async () => {
    const repository = new MemoryAgentRunRepository()
    const started = await repository.startRun({
      userId: USER_ID,
      clientRequestId: validUnlockRequest().clientRequestId,
      blockageReason: 'dont_know_where_to_start',
      promptVersion: 'unlock-v1',
    })
    if (started.kind !== 'created') {
      throw new Error('expected created')
    }
    const plan = validUnlockPlan()
    await repository.savePlan({
      runId: started.run.id,
      userId: USER_ID,
      plan,
      generationMode: 'agent',
    })
    const arbitration = await repository.beginFallback({
      runId: started.run.id,
      userId: USER_ID,
    })
    expect(arbitration.kind).toBe('persisted_plan_won')
    if (arbitration.kind === 'persisted_plan_won') {
      expect(arbitration.generationMode).toBe('agent')
      expect(arbitration.plan).toEqual(plan)
    }
  })

  it('classifies an existing fallback plan as persisted_plan_won with fallback mode', async () => {
    const repository = new MemoryAgentRunRepository()
    const started = await repository.startRun({
      userId: USER_ID,
      clientRequestId: '550e8400-e29b-41d4-a716-446655440021',
      blockageReason: 'dont_know_where_to_start',
      promptVersion: 'unlock-v1',
    })
    if (started.kind !== 'created') {
      throw new Error('expected created')
    }
    await repository.beginFallback({ runId: started.run.id, userId: USER_ID })
    const plan = validUnlockPlan({ title: 'Plano fallback' })
    await repository.savePlan({
      runId: started.run.id,
      userId: USER_ID,
      plan,
      generationMode: 'fallback',
    })
    const arbitration = await repository.beginFallback({
      runId: started.run.id,
      userId: USER_ID,
    })
    expect(arbitration.kind).toBe('persisted_plan_won')
    if (arbitration.kind === 'persisted_plan_won') {
      expect(arbitration.generationMode).toBe('fallback')
      expect(arbitration.plan.title).toBe('Plano fallback')
    }
    expect(JSON.stringify(arbitration)).not.toMatch(/agent_won/)
  })

  it('recovers an expired running lease atomically under concurrent retries', async () => {
    const repository = new MemoryAgentRunRepository()
    const input = {
      userId: USER_ID,
      clientRequestId: validUnlockRequest().clientRequestId,
      blockageReason: 'dont_know_where_to_start' as const,
      promptVersion: 'unlock-v1',
    }
    const first = await repository.startRun(input)
    expect(first.kind).toBe('created')
    repository.expireLease(USER_ID, input.clientRequestId)
    const [a, b] = await Promise.all([
      repository.startRun(input),
      repository.startRun(input),
    ])
    const kinds = [a.kind, b.kind].sort()
    expect(kinds).toEqual(['created', 'in_progress'])
    expect(repository.quotaUsed(USER_ID)).toBe(1)
  })

  it('resumes fallback after lease expiry without calling the agent runner', async () => {
    const repository = new MemoryAgentRunRepository()
    const started = await repository.startRun({
      userId: USER_ID,
      clientRequestId: '550e8400-e29b-41d4-a716-446655440022',
      blockageReason: 'dont_know_where_to_start',
      promptVersion: 'unlock-v1',
    })
    if (started.kind !== 'created') {
      throw new Error('expected created')
    }
    await repository.beginFallback({
      runId: started.run.id,
      userId: USER_ID,
    })
    repository.expireLease(USER_ID, '550e8400-e29b-41d4-a716-446655440022')

    let runnerCalled = false
    const { token, server } = await setup({
      repository,
      runner: {
        async run() {
          runnerCalled = true
          throw new AgentMaxTurnsError()
        },
      },
    })
    const response = await server.inject({
      method: 'POST',
      url: '/v1/agents/unlock-task/runs',
      headers: { authorization: `Bearer ${token}` },
      payload: validUnlockRequest({
        clientRequestId: '550e8400-e29b-41d4-a716-446655440022',
      }),
    })
    expect(runnerCalled).toBe(false)
    expect(response.statusCode).toBe(200)
    const body = UnlockTaskRunResponseSchema.parse(response.json())
    expect(body.status).toBe('completed')
    if (body.status === 'completed') {
      expect(body.generationMode).toBe('fallback')
    }
  })

  it('returns HTTP generationMode fallback when a fallback plan already won', async () => {
    const repository = new MemoryAgentRunRepository()
    const started = await repository.startRun({
      userId: USER_ID,
      clientRequestId: '550e8400-e29b-41d4-a716-446655440023',
      blockageReason: 'dont_know_where_to_start',
      promptVersion: 'unlock-v1',
    })
    if (started.kind !== 'created') {
      throw new Error('expected created')
    }
    await repository.beginFallback({
      runId: started.run.id,
      userId: USER_ID,
    })
    const plan = validUnlockPlan({ title: 'Plano ja persistido' })
    await repository.savePlan({
      runId: started.run.id,
      userId: USER_ID,
      plan,
      generationMode: 'fallback',
    })
    repository.expireLease(USER_ID, '550e8400-e29b-41d4-a716-446655440023')

    const { token, server } = await setup({
      repository,
      runner: {
        async run() {
          throw new AgentMaxTurnsError()
        },
      },
    })
    const response = await server.inject({
      method: 'POST',
      url: '/v1/agents/unlock-task/runs',
      headers: { authorization: `Bearer ${token}` },
      payload: validUnlockRequest({
        clientRequestId: '550e8400-e29b-41d4-a716-446655440023',
      }),
    })
    expect(response.statusCode).toBe(200)
    const body = UnlockTaskRunResponseSchema.parse(response.json())
    expect(body.status).toBe('completed')
    if (body.status === 'completed') {
      expect(body.generationMode).toBe('fallback')
      expect(body.plan.title).toBe('Plano ja persistido')
    }
  })

  it('does not recover a completed run with an old lease', async () => {
    const repository = new MemoryAgentRunRepository()
    const input = {
      userId: USER_ID,
      clientRequestId: validUnlockRequest().clientRequestId,
      blockageReason: 'dont_know_where_to_start' as const,
      promptVersion: 'unlock-v1',
    }
    const first = await repository.startRun(input)
    if (first.kind !== 'created') {
      throw new Error('expected created')
    }
    await repository.finishRun({
      runId: first.run.id,
      userId: USER_ID,
      status: 'completed',
      generationMode: 'agent',
      plan: validUnlockPlan(),
      response: {
        status: 'completed',
        runId: first.run.id,
        promptVersion: 'unlock-v1',
        generationMode: 'agent',
        createdAt: '2026-08-28T18:00:00.000Z',
        plan: validUnlockPlan(),
      },
      promptVersion: 'unlock-v1',
    })
    repository.expireLease(USER_ID, input.clientRequestId)
    const replay = await repository.startRun(input)
    expect(replay.kind).toBe('replay')
  })

  it('documents the three OpenAPI branches and serializes generationMode', async () => {
    const keys = await createTestVerifier()
    app = await buildTestApp({
      jwtVerifier: keys.verifier,
      unlockAgentRunner: createCompletedRunner(),
      config: { enableApiDocs: true },
    })
    const spec = app.swagger() as {
      components?: { schemas?: Record<string, unknown> }
      paths?: Record<
        string,
        {
          post?: {
            responses?: Record<
              string,
              {
                content?: {
                  'application/json'?: { schema?: { anyOf?: unknown[] } }
                }
              }
            >
          }
        }
      >
    }
    const schemas = spec.components?.schemas ?? {}
    expect(schemas.UnlockTaskRunCompleted).toBeDefined()
    expect(schemas.UnlockTaskRunNeedsClarification).toBeDefined()
    expect(schemas.UnlockTaskRunRejected).toBeDefined()
    const responseSchema =
      spec.paths?.['/v1/agents/unlock-task/runs']?.post?.responses?.['200']
        ?.content?.['application/json']?.schema
    expect(responseSchema?.anyOf?.length).toBe(3)

    const token = await signTestJwt(keys.privateKey, { subject: USER_ID })
    const completed = await app.inject({
      method: 'POST',
      url: '/v1/agents/unlock-task/runs',
      headers: { authorization: `Bearer ${token}` },
      payload: validUnlockRequest(),
    })
    const completedBody = UnlockTaskRunResponseSchema.parse(completed.json())
    expect(completed.statusCode).toBe(200)
    expect(completedBody.status).toBe('completed')
    if (completedBody.status === 'completed') {
      expect(completedBody.generationMode).toBe('agent')
      expect(completed.json()).toMatchObject({ generationMode: 'agent' })
    }
  })

  it('serializes clarification and rejected branches without dropping fields', async () => {
    const keys = await createTestVerifier()
    const token = await signTestJwt(keys.privateKey, { subject: USER_ID })
    app = await buildTestApp({
      jwtVerifier: keys.verifier,
      unlockAgentRunner: {
        async run() {
          return {
            output: {
              status: 'needs_clarification',
              question: 'Qual é o primeiro arquivo?',
            },
          }
        },
      },
    })
    const clarification = await app.inject({
      method: 'POST',
      url: '/v1/agents/unlock-task/runs',
      headers: { authorization: `Bearer ${token}` },
      payload: validUnlockRequest({
        clientRequestId: '550e8400-e29b-41d4-a716-446655440010',
      }),
    })
    const clarificationBody = UnlockTaskRunResponseSchema.parse(
      clarification.json(),
    )
    expect(clarificationBody.status).toBe('needs_clarification')
    if (clarificationBody.status === 'needs_clarification') {
      expect(clarificationBody.question).toContain('Qual é')
    }

    await app.close()
    app = await buildTestApp({
      jwtVerifier: keys.verifier,
      unlockAgentRunner: createCompletedRunner(),
    })
    const rejected = await app.inject({
      method: 'POST',
      url: '/v1/agents/unlock-task/runs',
      headers: { authorization: `Bearer ${token}` },
      payload: validUnlockRequest({
        clientRequestId: '550e8400-e29b-41d4-a716-446655440011',
        task: {
          ...validUnlockRequest().task,
          title: 'Quero me matar hoje',
        },
      }),
    })
    const rejectedBody = UnlockTaskRunResponseSchema.parse(rejected.json())
    expect(rejectedBody.status).toBe('rejected')
    if (rejectedBody.status === 'rejected') {
      expect(rejectedBody.message).toBe(safetyRejectionMessage('pt-BR'))
      expect(rejectedBody.message).toMatch(/não/)
      expect(rejectedBody.message).toMatch(/você/)
    }
  })
})
