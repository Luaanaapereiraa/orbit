import {
  Runner,
  setDefaultOpenAIKey,
  setTracingDisabled,
  withTrace,
} from '@openai/agents'
import type { AppConfig } from '../../config/env.js'
import { createUnlockTaskAgent } from './agent.js'
import type { UnlockRunContext } from './context.js'
import { UNLOCK_WORKFLOW_NAME } from './instructions.js'
import { AgentOutputSchema, type AgentOutput } from './schemas.js'

export class AgentTimeoutError extends Error {
  constructor() {
    super('agent_timeout')
    this.name = 'AgentTimeoutError'
  }
}

export class AgentProviderError extends Error {
  constructor(message = 'agent_provider_unavailable') {
    super(message)
    this.name = 'AgentProviderError'
  }
}

export class AgentProtocolError extends Error {
  constructor(message = 'invalid_agent_output') {
    super(message)
    this.name = 'AgentProtocolError'
  }
}

export class AgentMaxTurnsError extends Error {
  constructor() {
    super('agent_max_turns_exceeded')
    this.name = 'AgentMaxTurnsError'
  }
}

export interface UnlockAgentRunner {
  run(context: UnlockRunContext): Promise<{
    output: AgentOutput
    usage?: {
      inputTokens?: number
      outputTokens?: number
      totalTokens?: number
    }
  }>
}

export function unlockRunOptions(
  config: AppConfig,
  context: UnlockRunContext,
  signal?: AbortSignal,
) {
  return {
    context,
    maxTurns: config.agentMaxTurns,
    signal,
    parallelToolCalls: false as const,
  }
}

export function isMaxTurnsExceeded(error: unknown) {
  if (error instanceof AgentMaxTurnsError) {
    return true
  }
  const text =
    error instanceof Error ? `${error.name} ${error.message}` : String(error)
  return /MaxTurnsExceeded/i.test(text)
}

function isTransientProviderError(error: unknown) {
  if (error instanceof AgentTimeoutError || error instanceof AgentProviderError) {
    return true
  }
  if (isMaxTurnsExceeded(error) || error instanceof AgentProtocolError) {
    return false
  }
  const text =
    error instanceof Error ? `${error.name} ${error.message}` : String(error)
  return /timeout|ECONNRESET|ENOTFOUND|429|503|502|unavailable|rate.?limit/i.test(
    text,
  )
}

function isAbortError(error: unknown) {
  if (error instanceof AgentTimeoutError) {
    return true
  }
  if (typeof error === 'object' && error !== null && 'name' in error) {
    const name = String((error as { name: unknown }).name)
    if (name === 'AbortError' || name === 'TimeoutError') {
      return true
    }
  }
  const text =
    error instanceof Error ? `${error.name} ${error.message}` : String(error)
  return /aborted|abort_error/i.test(text)
}

export function createSdkUnlockAgentRunner(config: AppConfig): UnlockAgentRunner {
  if (config.openaiApiKey) {
    setDefaultOpenAIKey(config.openaiApiKey)
  }

  setTracingDisabled(!config.openaiAgentTracingEnabled)

  const runner = new Runner({
    tracingDisabled: !config.openaiAgentTracingEnabled,
    traceIncludeSensitiveData: config.openaiTraceIncludeSensitiveData,
    workflowName: UNLOCK_WORKFLOW_NAME,
    modelSettings: {
      parallelToolCalls: false,
    },
  })

  return {
    async run(context) {
      const agent = createUnlockTaskAgent(config, context.request.locale)
      const userTurn = [
        'Help the user start this task.',
        `Locale: ${context.request.locale}.`,
        'Call get_task_context first. Do not invent fields.',
      ].join(' ')
      const controller = new AbortController()
      const options = unlockRunOptions(config, context, controller.signal)
      let timer: ReturnType<typeof setTimeout> | undefined
      let settled = false

      const abortRun = () => {
        context.cancelled = true
        if (!controller.signal.aborted) {
          controller.abort()
        }
      }

      const sdkPromise = withTrace(
        UNLOCK_WORKFLOW_NAME,
        async () =>
          runner.run(agent, userTurn, {
            context: options.context,
            maxTurns: options.maxTurns,
            signal: options.signal,
          }),
        {
          groupId: context.runId,
          metadata: {
            runId: context.runId,
            promptVersion: config.openaiAgentPromptVersion,
          },
        },
      )

      try {
        const timed = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            abortRun()
            reject(new AgentTimeoutError())
          }, config.agentTimeoutMs)
        })

        const result = await Promise.race([sdkPromise, timed])
        if (context.cancelled || controller.signal.aborted) {
          throw new AgentTimeoutError()
        }

        const parsed = AgentOutputSchema.safeParse(result.finalOutput)
        if (!parsed.success) {
          throw new AgentProtocolError('invalid_agent_output')
        }

        const usage = result.rawResponses.reduce(
          (acc, response) => ({
            inputTokens: acc.inputTokens + (response.usage?.inputTokens ?? 0),
            outputTokens: acc.outputTokens + (response.usage?.outputTokens ?? 0),
            totalTokens: acc.totalTokens + (response.usage?.totalTokens ?? 0),
          }),
          { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        )

        settled = true
        return {
          output: parsed.data,
          usage: usage.totalTokens > 0 ? usage : undefined,
        }
      } catch (error) {
        if (isAbortError(error) || context.cancelled) {
          throw new AgentTimeoutError()
        }
        if (isMaxTurnsExceeded(error)) {
          throw new AgentMaxTurnsError()
        }
        if (error instanceof AgentProtocolError) {
          throw error
        }
        if (isTransientProviderError(error)) {
          throw new AgentProviderError(
            error instanceof Error ? error.name : 'agent_provider_unavailable',
          )
        }
        throw new AgentProtocolError(
          error instanceof Error ? error.name : 'invalid_agent_output',
        )
      } finally {
        if (timer) {
          clearTimeout(timer)
        }
        if (!settled) {
          abortRun()
        }
        void sdkPromise.catch(() => undefined)
      }
    },
  }
}
