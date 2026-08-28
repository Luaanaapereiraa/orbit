import type {
  UnlockPlan,
  UnlockTaskRunRequest,
  UnlockTaskRunResponse,
} from '@destravai/contracts'

export interface AgentRunRecord {
  id: string
  userId: string
  clientRequestId: string
  status:
    | 'pending'
    | 'running'
    | 'completed'
    | 'needs_clarification'
    | 'rejected'
    | 'failed'
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
  response: UnlockTaskRunResponse | null
}

export type StartUnlockRunResult =
  | { kind: 'created'; run: AgentRunRecord }
  | { kind: 'replay'; run: AgentRunRecord }
  | { kind: 'in_progress'; run: AgentRunRecord }
  | { kind: 'quota_exceeded' }

export interface FinishUnlockRunInput {
  runId: string
  userId: string
  status: UnlockTaskRunResponse['status'] | 'failed'
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

export interface AgentRunRepository {
  startRun(input: {
    userId: string
    clientRequestId: string
    blockageReason: UnlockTaskRunRequest['blockageReason']
    promptVersion: string
    dailyLimit: number
  }): Promise<StartUnlockRunResult>
  savePlan(input: {
    runId: string
    userId: string
    plan: UnlockPlan
  }): Promise<{ planId: string; runId: string }>
  finishRun(input: FinishUnlockRunInput): Promise<AgentRunRecord>
  getPlanByRunId(input: {
    runId: string
    userId: string
  }): Promise<{ planId: string; plan: UnlockPlan } | null>
}
