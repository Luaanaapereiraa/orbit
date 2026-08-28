import {
  UnlockTaskRunResponseSchema,
  type UnlockPlan,
  type UnlockTaskRunRequest,
  type UnlockTaskRunResponse,
} from '@destravai/contracts'
import { AppError } from '../../errors/app-error.js'
import type { AppConfig } from '../../config/env.js'
import { createUnlockRunContext } from './context.js'
import { buildFallbackPlan } from './fallback.js'
import {
  collectModerationText,
  PatternModerator,
  safetyRejectionMessage,
  type ContentModerator,
} from './guardrails/input.js'
import { inspectCompletedPlan } from './guardrails/output.js'
import type { AgentRunRepository } from './repositories/types.js'
import {
  AgentProviderError,
  AgentProtocolError,
  AgentTimeoutError,
  type UnlockAgentRunner,
} from './runner.js'
import { applyValidatedPlan } from './tools/validate-unlock-plan.js'
import { saveValidatedUnlockPlan } from './tools/save-unlock-plan.js'
import { readTrustedTaskContext } from './tools/get-task-context.js'

export interface UnlockTaskServiceDeps {
  config: AppConfig
  repository: AgentRunRepository
  runner: UnlockAgentRunner
  moderator?: ContentModerator
  clock?: () => Date
  log?: {
    info: (payload: Record<string, unknown>, message: string) => void
    error: (payload: Record<string, unknown>, message: string) => void
  }
}

function isRecoverableProviderError(error: unknown) {
  return error instanceof AgentTimeoutError || error instanceof AgentProviderError
}

export class UnlockTaskService {
  private readonly moderator: ContentModerator
  private readonly clock: () => Date

  constructor(private readonly deps: UnlockTaskServiceDeps) {
    this.moderator = deps.moderator ?? new PatternModerator()
    this.clock = deps.clock ?? (() => new Date())
  }

  async execute(input: {
    userId: string
    request: UnlockTaskRunRequest
    requestId?: string
  }): Promise<UnlockTaskRunResponse> {
    const started = this.clock()
    const promptVersion = this.deps.config.openaiAgentPromptVersion
    const safety = await this.inspectSafety(input.request)

    const startedRun = await this.deps.repository.startRun({
      userId: input.userId,
      clientRequestId: input.request.clientRequestId,
      blockageReason: input.request.blockageReason,
      promptVersion,
      dailyLimit: this.deps.config.agentDailyLimit,
    })

    if (startedRun.kind === 'quota_exceeded') {
      throw AppError.quotaExceeded()
    }

    if (startedRun.kind === 'in_progress') {
      throw AppError.conflict()
    }

    if (startedRun.kind === 'replay' && startedRun.run.response) {
      return UnlockTaskRunResponseSchema.parse(startedRun.run.response)
    }

    const run = startedRun.run
    const context = createUnlockRunContext({
      runId: run.id,
      userId: input.userId,
      request: input.request,
      repository: this.deps.repository,
    })

    if (safety === 'blocked') {
      const response: UnlockTaskRunResponse = {
        status: 'rejected',
        runId: run.id,
        promptVersion,
        createdAt: this.clock().toISOString(),
        reason: 'safety',
        message: safetyRejectionMessage(input.request.locale),
      }
      await this.deps.repository.finishRun({
        runId: run.id,
        userId: input.userId,
        status: 'rejected',
        response,
        promptVersion,
        errorCode: 'SAFETY',
      })
      return response
    }

    try {
      const result = await this.runAgentOrFallback(context)
      const latencyMs = Math.max(0, this.clock().getTime() - started.getTime())
      const response = this.toResponse(context, result.output, result.generationMode, latencyMs)

      await this.deps.repository.finishRun({
        runId: run.id,
        userId: input.userId,
        status: response.status,
        response,
        plan: response.status === 'completed' ? response.plan : undefined,
        generationMode:
          response.status === 'completed' ? response.generationMode : result.generationMode,
        model: this.deps.config.openaiModel || null,
        latencyMs,
        inputTokens: result.usage?.inputTokens ?? null,
        outputTokens: result.usage?.outputTokens ?? null,
        totalTokens: result.usage?.totalTokens ?? null,
        promptVersion,
      })

      this.deps.log?.info(
        {
          requestId: input.requestId,
          runId: run.id,
          status: response.status,
          latencyMs,
          generationMode: result.generationMode,
        },
        'unlock-task finished',
      )

      return response
    } catch (error) {
      const errorCode =
        error instanceof AppError ? error.code : 'INTERNAL_ERROR'

      await this.deps.repository.finishRun({
        runId: run.id,
        userId: input.userId,
        status: 'failed',
        response: null,
        errorCode,
        promptVersion,
        latencyMs: Math.max(0, this.clock().getTime() - started.getTime()),
      })

      if (error instanceof AppError) {
        throw error
      }

      throw error
    }
  }

  private async inspectSafety(request: UnlockTaskRunRequest) {
    const text = collectModerationText({
      title: request.task.title,
      nextAction: request.task.nextAction,
      blockageDetails: request.blockageDetails,
    })

    try {
      const result = await this.moderator.inspect(text)
      return result.blocked ? 'blocked' : 'ok'
    } catch {
      throw AppError.serviceUnavailable()
    }
  }

  private async runAgentOrFallback(context: ReturnType<typeof createUnlockRunContext>) {
    try {
      const result = await this.deps.runner.run(context)
      if (result.output.status === 'completed') {
        const inspection = inspectCompletedPlan(context, result.output.plan)
        if (!inspection.ok) {
          throw AppError.badGateway()
        }
      }
      return { ...result, generationMode: 'agent' as const }
    } catch (error) {
      if (error instanceof AppError) {
        throw error
      }
      if (error instanceof AgentProtocolError) {
        throw AppError.badGateway()
      }
      if (!isRecoverableProviderError(error)) {
        throw AppError.badGateway()
      }

      const alreadySaved = await context.repository.getPlanByRunId({
        runId: context.runId,
        userId: context.userId,
      })
      if (alreadySaved) {
        throw AppError.badGateway()
      }

      try {
        const plan = await this.persistFallback(context)
      return {
        output: { status: 'completed' as const, plan },
        generationMode: 'fallback' as const,
        usage: undefined,
      }
      } catch {
        if (error instanceof AgentTimeoutError) {
          throw AppError.gatewayTimeout()
        }
        throw AppError.serviceUnavailable()
      }
    }
  }

  private async persistFallback(context: ReturnType<typeof createUnlockRunContext>) {
    context.taskContextRead = false
    context.validatedPlanHash = null
    context.savedPlanId = null
    context.protocol = []

    const plan = buildFallbackPlan(context.request)
    readTrustedTaskContext(context)
    const validated = applyValidatedPlan(context, plan)
    if (!validated.valid) {
      throw AppError.internal()
    }
    const saved = await saveValidatedUnlockPlan(context, plan)
    if (!saved.saved) {
      throw AppError.internal()
    }
    return plan
  }

  private toResponse(
    context: ReturnType<typeof createUnlockRunContext>,
    output: {
      status: UnlockTaskRunResponse['status']
      plan?: UnlockPlan
      question?: string
      reason?: 'safety' | 'unsafe_input' | 'unsupported_request'
      message?: string
    },
    generationMode: 'agent' | 'fallback',
    latencyMs: number,
  ): UnlockTaskRunResponse {
    void latencyMs
    const createdAt = this.clock().toISOString()
    const promptVersion = this.deps.config.openaiAgentPromptVersion
    const runId = context.runId

    if (output.status === 'completed' && output.plan) {
      return UnlockTaskRunResponseSchema.parse({
        status: 'completed',
        runId,
        promptVersion,
        generationMode,
        createdAt,
        plan: output.plan,
      })
    }

    if (output.status === 'needs_clarification' && output.question) {
      return {
        status: 'needs_clarification',
        runId,
        promptVersion,
        createdAt,
        question: output.question,
      }
    }

    return {
      status: 'rejected',
      runId,
      promptVersion,
      createdAt,
      reason: output.reason ?? 'unsupported_request',
      message: output.message ?? 'Unable to continue with this request.',
    }
  }
}
