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
  FinishUnlockRunInput,
  StartUnlockRunResult,
} from './types.js'

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
    dailyLimit: number
  }): Promise<StartUnlockRunResult> {
    const { data, error } = await this.client.rpc('start_unlock_agent_run', {
      p_user_id: input.userId,
      p_client_request_id: input.clientRequestId,
      p_blockage_reason: input.blockageReason,
      p_prompt_version: input.promptVersion,
      p_daily_limit: input.dailyLimit,
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
  }) {
    const existing = await this.getPlanByRunId(input)
    if (existing) {
      return { planId: existing.planId, runId: input.runId }
    }

    const { data, error } = await this.client
      .from('unlock_plans')
      .insert({
        run_id: input.runId,
        user_id: input.userId,
        title: input.plan.title,
        summary: input.plan.summary,
        next_action: input.plan.nextAction,
        steps: input.plan.steps,
        total_minutes: input.plan.totalMinutes,
        recommended_focus_minutes: input.plan.recommendedFocusMinutes,
        energy: input.plan.energy,
        supportive_message: input.plan.supportiveMessage,
      })
      .select('id')
      .single()

    if (error) {
      if (error.code === '23505') {
        const raced = await this.getPlanByRunId(input)
        if (raced) {
          return { planId: raced.planId, runId: input.runId }
        }
      }
      throw error
    }

    return { planId: String(data.id), runId: input.runId }
  }

  async finishRun(input: FinishUnlockRunInput): Promise<AgentRunRecord> {
    const { data, error } = await this.client.rpc('finish_unlock_agent_run', {
      p_run_id: input.runId,
      p_user_id: input.userId,
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

    if (error || !data) {
      throw error ?? new Error('finish_failed')
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
}
