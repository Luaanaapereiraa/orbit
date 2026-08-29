import { randomUUID } from 'node:crypto'
import type { UnlockPlan, UnlockTaskRunResponse } from '@destravai/contracts'
import type {
  AgentRunRecord,
  AgentRunRepository,
  BeginFallbackResult,
  FinishUnlockRunInput,
  SaveUnlockPlanResult,
  StartUnlockRunResult,
} from './types.js'
import { InvalidRunTransitionError } from './types.js'

function utcDateKey(now: Date) {
  return now.toISOString().slice(0, 10)
}

function isActive(status: AgentRunRecord['status']) {
  return status === 'running' || status === 'pending' || status === 'fallback_pending'
}

function isTerminal(status: AgentRunRecord['status']) {
  return (
    status === 'completed' ||
    status === 'needs_clarification' ||
    status === 'rejected'
  )
}

function transitionAllowed(
  from: AgentRunRecord['status'],
  to: FinishUnlockRunInput['status'],
) {
  if (from === to) {
    return true
  }
  if (
    from === 'running' &&
    (to === 'completed' ||
      to === 'needs_clarification' ||
      to === 'rejected' ||
      to === 'failed' ||
      to === 'fallback_pending')
  ) {
    return true
  }
  if (from === 'fallback_pending' && (to === 'completed' || to === 'failed')) {
    return true
  }
  return false
}

export class MemoryAgentRunRepository implements AgentRunRepository {
  private readonly runs = new Map<string, AgentRunRecord>()
  private readonly plans = new Map<string, { planId: string; plan: UnlockPlan }>()
  private readonly quota = new Map<string, number>()
  private queue: Promise<unknown> = Promise.resolve()
  private readonly dailyLimit: number
  private readonly leaseMs: number

  constructor(
    private readonly clock: () => Date = () => new Date(),
    options: { dailyLimit?: number; leaseMs?: number } = {},
  ) {
    this.dailyLimit = options.dailyLimit ?? 5
    this.leaseMs = options.leaseMs ?? 90_000
  }

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

  private leaseExpiresAt(from = this.clock()) {
    return new Date(from.getTime() + this.leaseMs).toISOString()
  }

  private leaseExpired(run: AgentRunRecord) {
    if (!run.leaseExpiresAt) {
      return false
    }
    return Date.parse(run.leaseExpiresAt) <= this.clock().getTime()
  }

  startRun(input: {
    userId: string
    clientRequestId: string
    blockageReason: AgentRunRecord['blockageReason']
    promptVersion: string
    dailyLimit?: number
  }): Promise<StartUnlockRunResult> {
    return this.enqueue(() => this.startRunLocked(input))
  }

  private startRunLocked(input: {
    userId: string
    clientRequestId: string
    blockageReason: AgentRunRecord['blockageReason']
    promptVersion: string
    dailyLimit?: number
  }): StartUnlockRunResult {
    const limit = input.dailyLimit ?? this.dailyLimit
    const existing = this.runs.get(this.key(input.userId, input.clientRequestId))
    if (existing) {
      if (isActive(existing.status)) {
        if (this.leaseExpired(existing)) {
          const recovered: AgentRunRecord = {
            ...existing,
            status: 'running',
            errorCode: null,
            leaseExpiresAt: this.leaseExpiresAt(),
            updatedAt: this.clock().toISOString(),
          }
          this.runs.set(this.key(input.userId, input.clientRequestId), recovered)
          return { kind: 'created', run: recovered }
        }
        return { kind: 'in_progress', run: existing }
      }
      if (existing.status === 'failed') {
        const retried: AgentRunRecord = {
          ...existing,
          status: 'running',
          errorCode: null,
          leaseExpiresAt: this.leaseExpiresAt(),
          updatedAt: this.clock().toISOString(),
        }
        this.runs.set(this.key(input.userId, input.clientRequestId), retried)
        return { kind: 'created', run: retried }
      }
      return { kind: 'replay', run: existing }
    }

    const quotaKey = `${input.userId}:${utcDateKey(this.clock())}`
    const used = this.quota.get(quotaKey) ?? 0
    if (used >= limit) {
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
      leaseExpiresAt: this.leaseExpiresAt(),
      response: null,
    }
    this.runs.set(this.key(input.userId, input.clientRequestId), run)
    return { kind: 'created', run }
  }

  savePlan(input: {
    runId: string
    userId: string
    plan: UnlockPlan
    generationMode: 'agent' | 'fallback'
  }): Promise<SaveUnlockPlanResult> {
    return this.enqueue(() => this.savePlanLocked(input))
  }

  private savePlanLocked(input: {
    runId: string
    userId: string
    plan: UnlockPlan
    generationMode: 'agent' | 'fallback'
  }): SaveUnlockPlanResult {
    const current = [...this.runs.values()].find(
      (run) => run.id === input.runId && run.userId === input.userId,
    )
    if (!current) {
      throw new Error('run_not_found')
    }

    if (input.generationMode === 'agent' && current.status !== 'running') {
      return { kind: 'rejected', reason: 'not_running' }
    }
    if (
      input.generationMode === 'fallback' &&
      current.status !== 'fallback_pending'
    ) {
      return { kind: 'rejected', reason: 'not_fallback_pending' }
    }

    const already = this.plans.get(input.runId)
    if (already) {
      return {
        kind: 'saved',
        planId: already.planId,
        runId: input.runId,
        plan: already.plan,
      }
    }

    const planId = randomUUID()
    this.plans.set(input.runId, { planId, plan: input.plan })
    this.runs.set(this.key(current.userId, current.clientRequestId), {
      ...current,
      leaseExpiresAt: this.leaseExpiresAt(),
      updatedAt: this.clock().toISOString(),
    })
    return { kind: 'saved', planId, runId: input.runId, plan: input.plan }
  }

  beginFallback(input: {
    runId: string
    userId: string
  }): Promise<BeginFallbackResult> {
    return this.enqueue(() => this.beginFallbackLocked(input))
  }

  private beginFallbackLocked(input: {
    runId: string
    userId: string
  }): BeginFallbackResult {
    const current = [...this.runs.values()].find(
      (run) => run.id === input.runId && run.userId === input.userId,
    )
    if (!current) {
      throw new Error('run_not_found')
    }

    const stored = this.plans.get(input.runId) ?? null

    if (isTerminal(current.status)) {
      return {
        kind: 'already_terminal',
        run: current,
        plan: stored?.plan ?? null,
      }
    }

    if (stored) {
      return { kind: 'agent_won', run: current, plan: stored.plan }
    }

    if (current.status === 'failed') {
      return { kind: 'incompatible', run: current }
    }

    if (isActive(current.status)) {
      const next: AgentRunRecord = {
        ...current,
        status: 'fallback_pending',
        leaseExpiresAt: this.leaseExpiresAt(),
        updatedAt: this.clock().toISOString(),
      }
      this.runs.set(this.key(current.userId, current.clientRequestId), next)
      return { kind: 'timeout_won', run: next }
    }

    return { kind: 'incompatible', run: current }
  }

  finishRun(input: FinishUnlockRunInput): Promise<AgentRunRecord> {
    return this.enqueue(() => this.finishRunLocked(input))
  }

  private finishRunLocked(input: FinishUnlockRunInput): AgentRunRecord {
    const current = [...this.runs.values()].find(
      (run) => run.id === input.runId && run.userId === input.userId,
    )
    if (!current) {
      throw new Error('run_not_found')
    }

    if (!transitionAllowed(current.status, input.status)) {
      throw new InvalidRunTransitionError()
    }

    if (current.status === input.status) {
      return current
    }

    if (input.plan) {
      const saved = this.savePlanLocked({
        runId: input.runId,
        userId: input.userId,
        plan: input.plan,
        generationMode:
          input.generationMode ??
          (current.status === 'fallback_pending' ? 'fallback' : 'agent'),
      })
      if (saved.kind === 'rejected') {
        throw new InvalidRunTransitionError()
      }
    }

    const terminal = input.status !== 'fallback_pending'
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
      leaseExpiresAt: terminal ? null : this.leaseExpiresAt(),
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

  async getRun(input: { runId: string; userId: string }) {
    return (
      [...this.runs.values()].find(
        (item) => item.id === input.runId && item.userId === input.userId,
      ) ?? null
    )
  }

  peek(userId: string, clientRequestId: string) {
    return this.runs.get(this.key(userId, clientRequestId))
  }

  quotaUsed(userId: string, date = utcDateKey(this.clock())) {
    return this.quota.get(`${userId}:${date}`) ?? 0
  }

  expireLease(userId: string, clientRequestId: string) {
    const current = this.runs.get(this.key(userId, clientRequestId))
    if (!current) {
      return
    }
    this.runs.set(this.key(userId, clientRequestId), {
      ...current,
      leaseExpiresAt: new Date(this.clock().getTime() - 1).toISOString(),
    })
  }
}

export type { UnlockTaskRunResponse }
