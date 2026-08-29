import type {
  UnlockPlan,
  UnlockTaskRunRequest,
  UnlockTaskRunResponse,
} from '@destravai/contracts'

export type AgentRunStatus =
  | 'pending'
  | 'running'
  | 'fallback_pending'
  | 'completed'
  | 'needs_clarification'
  | 'rejected'
  | 'failed'

export interface AgentRunRecord {
  id: string
  userId: string
  clientRequestId: string
  status: AgentRunStatus
  blockageReason: string | null
  promptVersion: string | null
  model: string | null
  generationMode: 'agent' | 'fallback' | null
  latencyMs: number | null
  inputTokens: number | null
  outputTokens: number | null
  totalTokens: number | null
  errorCode: string | null
  createdAt: string
  updatedAt: string
  leaseExpiresAt: string | null
  response: UnlockTaskRunResponse | null
}

export type StartUnlockRunResult =
  | { kind: 'created'; run: AgentRunRecord }
  | { kind: 'replay'; run: AgentRunRecord }
  | { kind: 'in_progress'; run: AgentRunRecord }
  | { kind: 'quota_exceeded' }

export type SaveUnlockPlanResult =
  | { kind: 'saved'; planId: string; runId: string; plan: UnlockPlan }
  | { kind: 'rejected'; reason: 'not_running' | 'not_fallback_pending' }

export type BeginFallbackResult =
  | { kind: 'timeout_won'; run: AgentRunRecord }
  | {
      kind: 'persisted_plan_won'
      run: AgentRunRecord
      plan: UnlockPlan
      generationMode: 'agent' | 'fallback'
    }
  | {
      kind: 'already_terminal'
      run: AgentRunRecord
      plan: UnlockPlan | null
      generationMode: 'agent' | 'fallback' | null
    }
  | { kind: 'incompatible'; run: AgentRunRecord }

export interface FinishUnlockRunInput {
  runId: string
  userId: string
  status: UnlockTaskRunResponse['status'] | 'failed' | 'fallback_pending'
  response: UnlockTaskRunResponse | null
  plan?: UnlockPlan
  generationMode?: 'agent' | 'fallback' | null
  model?: string | null
  latencyMs?: number | null
  inputTokens?: number | null
  outputTokens?: number | null
  totalTokens?: number | null
  errorCode?: string | null
  promptVersion: string
}

export class InvalidRunTransitionError extends Error {
  constructor() {
    super('invalid_run_transition')
    this.name = 'InvalidRunTransitionError'
  }
}

export interface AgentRunRepository {
  startRun(input: {
    userId: string
    clientRequestId: string
    blockageReason: UnlockTaskRunRequest['blockageReason']
    promptVersion: string
    dailyLimit?: number
  }): Promise<StartUnlockRunResult>
  savePlan(input: {
    runId: string
    userId: string
    plan: UnlockPlan
    generationMode: 'agent' | 'fallback'
  }): Promise<SaveUnlockPlanResult>
  beginFallback(input: {
    runId: string
    userId: string
  }): Promise<BeginFallbackResult>
  finishRun(input: FinishUnlockRunInput): Promise<AgentRunRecord>
  getPlanByRunId(input: {
    runId: string
    userId: string
  }): Promise<{ planId: string; plan: UnlockPlan } | null>
  getRun(input: { runId: string; userId: string }): Promise<AgentRunRecord | null>
}
