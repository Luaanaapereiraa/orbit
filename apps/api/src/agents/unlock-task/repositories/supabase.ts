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

export function createSupabaseUserClient(
  config: AppConfig,
  accessToken: string,
): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
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
    void input.userId
    void input.dailyLimit
    const { data, error } = await this.client.rpc('start_unlock_agent_run', {
      p_client_request_id: input.clientRequestId,
      p_blockage_reason: input.blockageReason,
      p_prompt_version: input.promptVersion,
    })

    if (error) {
      throw error
    }

    const payload = data as { kind: string; run?: Record<string, unknown> }
    if (payload.kind === 'quota_exceeded') {
      return { kind: 'quota_exceeded' }
    }
    if (!payload.run) {
      throw new Error('invalid_start_payload')
    }
    const run = mapRun(payload.run)
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
    void input.userId
    const { data, error } = await this.client.rpc('save_unlock_agent_plan', {
      p_run_id: input.runId,
      p_plan: input.plan,
      p_generation_mode: input.generationMode,
    })

    if (error) {
      throw error
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
      throw new Error('invalid_save_payload')
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
    void input.userId
    const { data, error } = await this.client.rpc('begin_unlock_fallback', {
      p_run_id: input.runId,
    })

    if (error) {
      throw error
    }

    const payload = data as {
      kind: string
      run?: Record<string, unknown>
      plan?: Record<string, unknown> | null
    }

    if (!payload.run) {
      throw new Error('invalid_fallback_payload')
    }

    const run = mapRun(payload.run)
    const plan = planFromRpc(payload.plan ?? null)

    if (payload.kind === 'timeout_won') {
      return { kind: 'timeout_won', run }
    }
    if (payload.kind === 'agent_won' && plan) {
      return { kind: 'agent_won', run, plan }
    }
    if (payload.kind === 'already_terminal') {
      return { kind: 'already_terminal', run, plan }
    }
    return { kind: 'incompatible', run }
  }

  async finishRun(input: FinishUnlockRunInput): Promise<AgentRunRecord> {
    const { data, error } = await this.client.rpc('finish_unlock_agent_run', {
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
      if (error.message?.includes('invalid run transition')) {
        throw new InvalidRunTransitionError()
      }
      throw error
    }
    if (!data) {
      throw new Error('finish_failed')
    }

    return mapRun(data as Record<string, unknown>)
  }

  async getPlanByRunId(input: { runId: string; userId: string }) {
    const { data, error } = await this.client
      .from('unlock_plans')
      .select('*')
      .eq('run_id', input.runId)
      .eq('user_id', input.userId)
      .maybeSingle()

    if (error) {
      throw error
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
      throw error
    }
    if (!data) {
      return null
    }
    return mapRun(data as Record<string, unknown>)
  }
}
