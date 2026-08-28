import {
  Runner,
  setDefaultOpenAIKey,
  setTracingDisabled,
  withTrace,
} from '@openai/agents'
import type { AppConfig } from '../../config/env.js'
import { UNLOCK_TOOL_CONCURRENCY, createUnlockTaskAgent } from './agent.js'
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

export function unlockRunOptions(config: AppConfig, context: UnlockRunContext) {
  return {
    context,
    maxTurns: config.agentMaxTurns,
    toolConcurrency: UNLOCK_TOOL_CONCURRENCY,
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new AgentTimeoutError()), timeoutMs)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

function isTransientProviderError(error: unknown) {
  if (error instanceof AgentTimeoutError || error instanceof AgentProviderError) {
    return true
  }
  const text =
    error instanceof Error ? `${error.name} ${error.message}` : String(error)
  return /timeout|ECONNRESET|ENOTFOUND|429|503|502|unavailable|rate.?limit|MaxTurnsExceeded/i.test(
    text,
  )
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
      const options = unlockRunOptions(config, context)

      try {
        const result = await withTimeout(
          withTrace(
            UNLOCK_WORKFLOW_NAME,
            async () =>
              runner.run(agent, userTurn, {
                context: options.context,
                maxTurns: options.maxTurns,
              }),
            {
              groupId: context.runId,
              metadata: {
                runId: context.runId,
                promptVersion: config.openaiAgentPromptVersion,
              },
            },
          ),
          config.agentTimeoutMs,
        )

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

        return {
          output: parsed.data,
          usage: usage.totalTokens > 0 ? usage : undefined,
        }
      } catch (error) {
        if (
          error instanceof AgentTimeoutError ||
          error instanceof AgentProtocolError
        ) {
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
      }
    },
  }
}
