import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  UnlockPlanSchema,
  UnlockTaskRunResponseSchema,
  type UnlockPlan,
} from '@destravai/contracts'
import type { AppConfig } from '../../../config/env.js'
import type {
  AgentRunRecord,
  AgentRunRepository,
  BeginFallbackResult,
  FinishUnlockRunInput,
  SaveUnlockPlanResult,
  StartUnlockRunResult,
} from './types.js'
import { InvalidRunTransitionError } from './types.js'

function mapRun(row: Record<string, unknown>): AgentRunRecord {
  const response = row.result_payload
    ? UnlockTaskRunResponseSchema.parse(row.result_payload)
    : null

  return {
    id: String(row.id),
    userId: String(row.user_id),
    clientRequestId: String(row.client_request_id),
    status: row.status as AgentRunRecord['status'],
    blockageReason: (row.blockage_reason as string | null) ?? null,
    promptVersion: (row.prompt_version as string | null) ?? null,
    model: (row.model as string | null) ?? null,
    generationMode: (row.generation_mode as AgentRunRecord['generationMode']) ?? null,
    latencyMs: (row.latency_ms as number | null) ?? null,
    inputTokens: (row.input_tokens as number | null) ?? null,
    outputTokens: (row.output_tokens as number | null) ?? null,
    totalTokens: (row.total_tokens as number | null) ?? null,
    errorCode: (row.error_code as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    leaseExpiresAt: row.lease_expires_at ? String(row.lease_expires_at) : null,
    response,
  }
}

function planFromRow(row: Record<string, unknown>): UnlockPlan {
  return UnlockPlanSchema.parse({
    title: row.title,
    summary: row.summary,
    nextAction: row.next_action,
    steps: row.steps,
    totalMinutes: row.total_minutes,
    recommendedFocusMinutes: row.recommended_focus_minutes,
    energy: row.energy,
    supportiveMessage: row.supportive_message,
  })
}

function planFromRpc(row: Record<string, unknown> | null): UnlockPlan | null {
  if (!row) {
    return null
  }
  return planFromRow(row)
}

function persistenceFailed(): Error {
  return new Error('persistence_failed')
}

function isInvalidTransition(error: unknown) {
  if (typeof error !== 'object' || error === null) {
    return false
  }
  const candidate = error as { code?: unknown; message?: unknown }
  if (candidate.code === '22023') {
    return true
  }
  return typeof candidate.message === 'string' && candidate.message.includes('invalid run transition')
}

function generationModeFrom(
  value: unknown,
  fallback: 'agent' | 'fallback' | null,
): 'agent' | 'fallback' | null {
  if (value === 'agent' || value === 'fallback') {
    return value
  }
  return fallback
}

export function createSupabaseBackendClient(config: AppConfig): SupabaseClient {
  if (!config.supabaseSecretKey) {
    throw new Error('persistence_failed')
  }

  return createClient(config.supabaseUrl, config.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as SupabaseClient
}

export class SupabaseAgentRunRepository implements AgentRunRepository {
  constructor(private readonly client: SupabaseClient) {}

  async startRun(input: {
    userId: string
    clientRequestId: string
    blockageReason: string
    promptVersion: string
    dailyLimit?: number
  }): Promise<StartUnlockRunResult> {
    void input.dailyLimit
    const { data, error } = await this.client.rpc('start_unlock_agent_run', {
      p_user_id: input.userId,
      p_client_request_id: input.clientRequestId,
      p_blockage_reason: input.blockageReason,
      p_prompt_version: input.promptVersion,
    })

    if (error) {
      throw persistenceFailed()
    }

    const payload = data as { kind: string; run?: Record<string, unknown> }
    if (payload.kind === 'quota_exceeded') {
      return { kind: 'quota_exceeded' }
    }
    if (!payload.run) {
      throw persistenceFailed()
    }
    const run = mapRun(payload.run)
    if (run.userId !== input.userId) {
      throw persistenceFailed()
    }
    if (payload.kind === 'in_progress') {
      return { kind: 'in_progress', run }
    }
    if (payload.kind === 'replay') {
      return { kind: 'replay', run }
    }
    return { kind: 'created', run }
  }

  async savePlan(input: {
    runId: string
    userId: string
    plan: UnlockPlan
    generationMode: 'agent' | 'fallback'
  }): Promise<SaveUnlockPlanResult> {
    const { data, error } = await this.client.rpc('save_unlock_agent_plan', {
      p_user_id: input.userId,
      p_run_id: input.runId,
      p_plan: input.plan,
      p_generation_mode: input.generationMode,
    })

    if (error) {
      throw persistenceFailed()
    }

    const payload = data as {
      kind: string
      reason?: string
      plan_id?: string
      run_id?: string
      plan?: Record<string, unknown>
    }

    if (payload.kind === 'rejected') {
      return {
        kind: 'rejected',
        reason:
          payload.reason === 'not_fallback_pending'
            ? 'not_fallback_pending'
            : 'not_running',
      }
    }

    if (payload.kind !== 'saved' || !payload.plan_id || !payload.plan) {
      throw persistenceFailed()
    }

    return {
      kind: 'saved',
      planId: String(payload.plan_id),
      runId: String(payload.run_id ?? input.runId),
      plan: planFromRow(payload.plan),
    }
  }

  async beginFallback(input: {
    runId: string
    userId: string
  }): Promise<BeginFallbackResult> {
    const { data, error } = await this.client.rpc('begin_unlock_fallback', {
      p_user_id: input.userId,
      p_run_id: input.runId,
    })

    if (error) {
      throw persistenceFailed()
    }

    const payload = data as {
      kind: string
      generation_mode?: unknown
      run?: Record<string, unknown>
      plan?: Record<string, unknown> | null
    }

    if (!payload.run) {
      throw persistenceFailed()
    }

    const run = mapRun(payload.run)
    if (run.userId !== input.userId) {
      throw persistenceFailed()
    }
    const plan = planFromRpc(payload.plan ?? null)

    if (payload.kind === 'fallback_claimed' || payload.kind === 'timeout_won') {
      return { kind: 'fallback_claimed', run }
    }
    if (payload.kind === 'persisted_plan_won' && plan) {
      const generationMode = generationModeFrom(
        payload.generation_mode,
        run.generationMode ?? (run.status === 'fallback_pending' ? 'fallback' : 'agent'),
      )
      if (!generationMode) {
        throw persistenceFailed()
      }
      return { kind: 'persisted_plan_won', run, plan, generationMode }
    }
    if (payload.kind === 'already_terminal') {
      return {
        kind: 'already_terminal',
        run,
        plan,
        generationMode: generationModeFrom(payload.generation_mode, run.generationMode),
      }
    }
    return { kind: 'incompatible', run }
  }

  async finishRun(input: FinishUnlockRunInput): Promise<AgentRunRecord> {
    const { data, error } = await this.client.rpc('finish_unlock_agent_run', {
      p_user_id: input.userId,
      p_run_id: input.runId,
      p_status: input.status,
      p_prompt_version: input.promptVersion,
      p_result_payload: input.response,
      p_generation_mode: input.generationMode ?? null,
      p_model: input.model ?? null,
      p_latency_ms: input.latencyMs ?? null,
      p_input_tokens: input.inputTokens ?? null,
      p_output_tokens: input.outputTokens ?? null,
      p_total_tokens: input.totalTokens ?? null,
      p_error_code: input.errorCode ?? null,
      p_plan: input.plan ?? null,
    })

    if (error) {
      if (isInvalidTransition(error)) {
        throw new InvalidRunTransitionError()
      }
      throw persistenceFailed()
    }
    if (!data) {
      throw persistenceFailed()
    }

    const run = mapRun(data as Record<string, unknown>)
    if (run.userId !== input.userId) {
      throw persistenceFailed()
    }
    return run
  }

  async getPlanByRunId(input: { runId: string; userId: string }) {
    const { data, error } = await this.client
      .from('unlock_plans')
      .select('*')
      .eq('run_id', input.runId)
      .eq('user_id', input.userId)
      .maybeSingle()

    if (error) {
      throw persistenceFailed()
    }
    if (!data) {
      return null
    }

    return {
      planId: String(data.id),
      plan: planFromRow(data as Record<string, unknown>),
    }
  }

  async getRun(input: { runId: string; userId: string }) {
    const { data, error } = await this.client
      .from('agent_runs')
      .select('*')
      .eq('id', input.runId)
      .eq('user_id', input.userId)
      .maybeSingle()

    if (error) {
      throw persistenceFailed()
    }
    if (!data) {
      return null
    }
    const run = mapRun(data as Record<string, unknown>)
    if (run.userId !== input.userId) {
      return null
    }
    return run
  }
}
