import { describe, expect, it } from 'vitest'
import { createUnlockRunContext } from '../agents/unlock-task/context.js'
import { hashUnlockPlan } from '../agents/unlock-task/plan-hash.js'
import { MemoryAgentRunRepository } from '../agents/unlock-task/repositories/memory.js'
import { readTrustedTaskContext } from '../agents/unlock-task/tools/get-task-context.js'
import { saveValidatedUnlockPlan } from '../agents/unlock-task/tools/save-unlock-plan.js'
import {
  applyValidatedPlan,
  validateUnlockPlanDeterministic,
} from '../agents/unlock-task/tools/validate-unlock-plan.js'
import { inspectCompletedPlan } from '../agents/unlock-task/guardrails/output.js'
import { createUnlockTaskAgent, createToolGate } from '../agents/unlock-task/agent.js'
import { unlockRunOptions } from '../agents/unlock-task/runner.js'
import { testConfig, validUnlockPlan, validUnlockRequest } from './helpers.js'

function contextWithRepo() {
  const repository = new MemoryAgentRunRepository()
  return {
    repository,
    context: createUnlockRunContext({
      runId: 'run-1',
      userId: 'user-1',
      request: validUnlockRequest(),
      repository,
    }),
  }
}

describe('unlock-task tools and protocol', () => {
  it('reads only trusted context and never accepts a model-chosen task', async () => {
    const { context } = contextWithRepo()
    const started = await context.repository.startRun({
      userId: 'user-1',
      clientRequestId: validUnlockRequest().clientRequestId,
      blockageReason: 'dont_know_where_to_start',
      promptVersion: 'unlock-v1',
      dailyLimit: 5,
    })
    expect(started.kind).toBe('created')
    context.runId = started.kind === 'created' ? started.run.id : context.runId

    const payload = readTrustedTaskContext(context)
    expect(payload).not.toHaveProperty('userId')
    expect(payload).not.toHaveProperty('email')
    expect(payload).not.toHaveProperty('token')
    expect(payload.title).toBe('Preparar apresentacao')
    expect(context.taskContextRead).toBe(true)
  })

  it('rejects an invalid plan and allows a later revision', async () => {
    const { context } = contextWithRepo()
    readTrustedTaskContext(context)
    const invalid = {
      ...validUnlockPlan(),
      steps: [{ order: 1, title: 'Abrir o arquivo', minutes: 5 }],
    }
    const first = applyValidatedPlan(context, invalid as never)
    expect(first.valid).toBe(false)
    expect(first.planHash).toBeNull()

    const revised = validUnlockPlan()
    const second = applyValidatedPlan(context, revised)
    expect(second.valid).toBe(true)
    expect(second.planHash).toBe(hashUnlockPlan(revised))
  })

  it('produces a deterministic plan hash', () => {
    const plan = validUnlockPlan()
    expect(hashUnlockPlan(plan)).toBe(hashUnlockPlan({ ...plan }))
  })

  it('blocks a plan change after validation', async () => {
    const { context } = contextWithRepo()
    await context.repository.startRun({
      userId: 'user-1',
      clientRequestId: validUnlockRequest().clientRequestId,
      blockageReason: 'dont_know_where_to_start',
      promptVersion: 'unlock-v1',
      dailyLimit: 5,
    })
    readTrustedTaskContext(context)
    const plan = validUnlockPlan()
    applyValidatedPlan(context, plan)
    const changed = validUnlockPlan({
      title: 'Outro titulo',
    })
    const saved = await saveValidatedUnlockPlan(context, changed)
    expect(saved.saved).toBe(false)
    if (!saved.saved) {
      expect(saved.error).toBe('plan_hash_mismatch')
    }
  })

  it('saves idempotently and requires the completed protocol', async () => {
    const { context } = contextWithRepo()
    const started = await context.repository.startRun({
      userId: 'user-1',
      clientRequestId: validUnlockRequest().clientRequestId,
      blockageReason: 'dont_know_where_to_start',
      promptVersion: 'unlock-v1',
      dailyLimit: 5,
    })
    if (started.kind !== 'created') {
      throw new Error('expected created run')
    }
    context.runId = started.run.id
    readTrustedTaskContext(context)
    const plan = validUnlockPlan()
    applyValidatedPlan(context, plan)
    const first = await saveValidatedUnlockPlan(context, plan)
    const second = await saveValidatedUnlockPlan(context, plan)
    expect(first.saved).toBe(true)
    expect(second.saved).toBe(true)
    if (first.saved && second.saved) {
      expect(first.planId).toBe(second.planId)
    }
    expect(inspectCompletedPlan(context, plan).ok).toBe(true)
  })

  it('rejects a completed response that does not match the saved plan', async () => {
    const { context } = contextWithRepo()
    const started = await context.repository.startRun({
      userId: 'user-1',
      clientRequestId: validUnlockRequest().clientRequestId,
      blockageReason: 'dont_know_where_to_start',
      promptVersion: 'unlock-v1',
      dailyLimit: 5,
    })
    if (started.kind !== 'created') {
      throw new Error('expected created run')
    }
    context.runId = started.run.id
    readTrustedTaskContext(context)
    const plan = validUnlockPlan()
    applyValidatedPlan(context, plan)
    await saveValidatedUnlockPlan(context, plan)
    const other = validUnlockPlan({ title: 'Plano diferente' })
    expect(inspectCompletedPlan(context, other).ok).toBe(false)
  })

  it('serializes tools and keeps parallelToolCalls disabled', async () => {
    const options = unlockRunOptions(
      testConfig({ agentMaxTurns: 8, agentTimeoutMs: 20000 }),
      contextWithRepo().context,
    )
    expect(options.maxTurns).toBe(8)
    expect(options.parallelToolCalls).toBe(false)
    expect(options).not.toHaveProperty('toolConcurrency')
    const agent = createUnlockTaskAgent(
      testConfig({ openaiModel: 'test-model' }),
      'pt-BR',
    )
    expect(agent.modelSettings.parallelToolCalls).toBe(false)

    const runExclusive = createToolGate()
    const slow = runExclusive(
      () => new Promise((resolve) => setTimeout(() => resolve('a'), 30)),
    )
    await expect(runExclusive(async () => 'b')).rejects.toThrow(
      'tool_concurrency_violation',
    )
    await expect(slow).resolves.toBe('a')
  })

  it('rejects medical output', () => {
    const plan = validUnlockPlan({
      supportiveMessage: 'Isso parece um diagnostico de depressao. Tome o medicamento.',
    })
    const result = validateUnlockPlanDeterministic(plan, validUnlockRequest())
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('medical_content')
  })

  it('does not persist an agent plan after cancellation', async () => {
    const { context } = contextWithRepo()
    const started = await context.repository.startRun({
      userId: 'user-1',
      clientRequestId: validUnlockRequest().clientRequestId,
      blockageReason: 'dont_know_where_to_start',
      promptVersion: 'unlock-v1',
      dailyLimit: 5,
    })
    if (started.kind !== 'created') {
      throw new Error('expected created run')
    }
    context.runId = started.run.id
    readTrustedTaskContext(context)
    const plan = validUnlockPlan()
    applyValidatedPlan(context, plan)
    context.cancelled = true
    const saved = await saveValidatedUnlockPlan(context, plan, 'agent')
    expect(saved.saved).toBe(false)
    if (!saved.saved) {
      expect(saved.error).toBe('cancelled')
    }
    expect(
      await context.repository.getPlanByRunId({
        runId: context.runId,
        userId: 'user-1',
      }),
    ).toBeNull()
  })

  it('persists a fallback plan after the agent run was cancelled', async () => {
    const { context } = contextWithRepo()
    const started = await context.repository.startRun({
      userId: 'user-1',
      clientRequestId: validUnlockRequest().clientRequestId,
      blockageReason: 'dont_know_where_to_start',
      promptVersion: 'unlock-v1',
      dailyLimit: 5,
    })
    if (started.kind !== 'created') {
      throw new Error('expected created run')
    }
    context.runId = started.run.id
    context.cancelled = true
    readTrustedTaskContext(context)
    const plan = validUnlockPlan()
    applyValidatedPlan(context, plan)
    const claimed = await context.repository.beginFallback({
      runId: context.runId,
      userId: 'user-1',
    })
    expect(claimed.kind).toBe('fallback_claimed')
    const saved = await saveValidatedUnlockPlan(context, plan, 'fallback')
    expect(saved.saved).toBe(true)
    if (saved.saved) {
      expect(saved.plan).toEqual(plan)
    }
  })
})
