import { randomUUID } from 'node:crypto'
import type { UnlockPlan, UnlockTaskRunResponse } from '@destravai/contracts'
import type {
  AgentRunRecord,
  AgentRunRepository,
  FinishUnlockRunInput,
  StartUnlockRunResult,
} from './types.js'

function utcDateKey(now: Date) {
  return now.toISOString().slice(0, 10)
}

export class MemoryAgentRunRepository implements AgentRunRepository {
  private readonly runs = new Map<string, AgentRunRecord>()
  private readonly plans = new Map<string, { planId: string; plan: UnlockPlan }>()
  private readonly quota = new Map<string, number>()
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private readonly clock: () => Date = () => new Date()) {}

  private key(userId: string, clientRequestId: string) {
    return `${userId}:${clientRequestId}`
  }

  private enqueue<T>(work: () => Promise<T> | T): Promise<T> {
    const next = this.queue.then(work, work)
    this.queue = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }

  startRun(input: {
    userId: string
    clientRequestId: string
    blockageReason: AgentRunRecord['blockageReason']
    promptVersion: string
    dailyLimit: number
  }): Promise<StartUnlockRunResult> {
    return this.enqueue(() => this.startRunLocked(input))
  }

  private startRunLocked(input: {
    userId: string
    clientRequestId: string
    blockageReason: AgentRunRecord['blockageReason']
    promptVersion: string
    dailyLimit: number
  }): StartUnlockRunResult {
    const existing = this.runs.get(this.key(input.userId, input.clientRequestId))
    if (existing) {
      if (existing.status === 'running' || existing.status === 'pending') {
        return { kind: 'in_progress', run: existing }
      }
      if (existing.status === 'failed') {
        const retried: AgentRunRecord = {
          ...existing,
          status: 'running',
          errorCode: null,
          updatedAt: this.clock().toISOString(),
        }
        this.runs.set(this.key(input.userId, input.clientRequestId), retried)
        return { kind: 'created', run: retried }
      }
      return { kind: 'replay', run: existing }
    }

    const quotaKey = `${input.userId}:${utcDateKey(this.clock())}`
    const used = this.quota.get(quotaKey) ?? 0
    if (used >= input.dailyLimit) {
      return { kind: 'quota_exceeded' }
    }
    this.quota.set(quotaKey, used + 1)

    const now = this.clock().toISOString()
    const run: AgentRunRecord = {
      id: randomUUID(),
      userId: input.userId,
      clientRequestId: input.clientRequestId,
      status: 'running',
      blockageReason: input.blockageReason,
      promptVersion: input.promptVersion,
      model: null,
      generationMode: null,
      latencyMs: null,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      errorCode: null,
      createdAt: now,
      updatedAt: now,
      response: null,
    }
    this.runs.set(this.key(input.userId, input.clientRequestId), run)
    return { kind: 'created', run }
  }

  async savePlan(input: {
    runId: string
    userId: string
    plan: UnlockPlan
  }) {
    const current = [...this.runs.values()].find(
      (run) => run.id === input.runId && run.userId === input.userId,
    )
    if (!current) {
      throw new Error('run_not_found')
    }

    const already = this.plans.get(input.runId)
    if (already) {
      return { planId: already.planId, runId: input.runId }
    }

    const planId = randomUUID()
    this.plans.set(input.runId, { planId, plan: input.plan })
    return { planId, runId: input.runId }
  }

  async finishRun(input: FinishUnlockRunInput): Promise<AgentRunRecord> {
    const current = [...this.runs.values()].find(
      (run) => run.id === input.runId && run.userId === input.userId,
    )
    if (!current) {
      throw new Error('run_not_found')
    }

    if (input.plan) {
      await this.savePlan({
        runId: input.runId,
        userId: input.userId,
        plan: input.plan,
      })
    }

    const next: AgentRunRecord = {
      ...current,
      status: input.status === 'failed' ? 'failed' : input.status,
      generationMode: input.generationMode ?? current.generationMode,
      model: input.model ?? current.model,
      latencyMs: input.latencyMs ?? current.latencyMs,
      inputTokens: input.inputTokens ?? current.inputTokens,
      outputTokens: input.outputTokens ?? current.outputTokens,
      totalTokens: input.totalTokens ?? current.totalTokens,
      errorCode: input.errorCode ?? current.errorCode,
      promptVersion: input.promptVersion,
      response: input.response,
      updatedAt: this.clock().toISOString(),
    }
    this.runs.set(this.key(current.userId, current.clientRequestId), next)
    return next
  }

  async getPlanByRunId(input: { runId: string; userId: string }) {
    const run = [...this.runs.values()].find(
      (item) => item.id === input.runId && item.userId === input.userId,
    )
    if (!run) {
      return null
    }
    return this.plans.get(input.runId) ?? null
  }

  peek(userId: string, clientRequestId: string) {
    return this.runs.get(this.key(userId, clientRequestId))
  }

  quotaUsed(userId: string, date = utcDateKey(this.clock())) {
    return this.quota.get(`${userId}:${date}`) ?? 0
  }
}

export type { UnlockTaskRunResponse }
