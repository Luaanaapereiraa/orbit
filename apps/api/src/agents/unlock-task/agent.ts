import { Agent, tool, type RunContext } from '@openai/agents'
import { z } from 'zod'
import { UnlockPlanSchema, type UnlockPlan } from '@destravai/contracts'
import type { AppConfig } from '../../config/env.js'
import {
  assertRunNotCancelled,
  type UnlockRunContext,
} from './context.js'
import { unlockAgentInstructions } from './instructions.js'
import { AgentStructuredOutputSchema, EmptyArgsSchema } from './schemas.js'
import { readTrustedTaskContext } from './tools/get-task-context.js'
import { saveValidatedUnlockPlan } from './tools/save-unlock-plan.js'
import { applyValidatedPlan } from './tools/validate-unlock-plan.js'

export function createToolGate() {
  let busy = false

  return async function runExclusive<T>(work: () => Promise<T> | T): Promise<T> {
    if (busy) {
      throw new Error('tool_concurrency_violation')
    }
    busy = true
    try {
      return await work()
    } finally {
      busy = false
    }
  }
}

function requireContext(ctx: RunContext<UnlockRunContext> | undefined) {
  if (!ctx) {
    throw new Error('missing_run_context')
  }
  return ctx.context
}

export function createUnlockTaskTools() {
  const runExclusive = createToolGate()

  const getTaskContext = tool({
    name: 'get_task_context',
    description:
      'Read the trusted task context for this run. Call this before proposing a plan.',
    parameters: EmptyArgsSchema,
    strict: true,
    execute: async (_args, ctx) =>
      runExclusive(() => {
        const context = requireContext(ctx as RunContext<UnlockRunContext>)
        assertRunNotCancelled(context)
        return readTrustedTaskContext(context)
      }),
  })

  const planArgs = z.object({ plan: UnlockPlanSchema }).strict()

  const validateUnlockPlan = tool({
    name: 'validate_unlock_plan',
    description: 'Validate a proposed unlock plan against deterministic rules.',
    parameters: planArgs,
    strict: true,
    execute: async (input, ctx) =>
      runExclusive(() => {
        const context = requireContext(ctx as RunContext<UnlockRunContext>)
        assertRunNotCancelled(context)
        return applyValidatedPlan(context, (input as { plan: UnlockPlan }).plan)
      }),
  })

  const saveUnlockPlan = tool({
    name: 'save_unlock_plan',
    description:
      'Persist a previously validated plan. The plan must match the last validated hash.',
    parameters: planArgs,
    strict: true,
    execute: async (input, ctx) =>
      runExclusive(async () => {
        const context = requireContext(ctx as RunContext<UnlockRunContext>)
        assertRunNotCancelled(context)
        const saved = await saveValidatedUnlockPlan(
          context,
          (input as { plan: UnlockPlan }).plan,
          'agent',
        )
        assertRunNotCancelled(context)
        return saved
      }),
  })

  return { getTaskContext, validateUnlockPlan, saveUnlockPlan }
}

export function createUnlockTaskAgent(
  config: AppConfig,
  locale: 'pt-BR' | 'en-US',
) {
  const tools = createUnlockTaskTools()

  return new Agent({
    name: 'Destravar tarefa',
    instructions: unlockAgentInstructions(locale),
    model: config.openaiModel,
    outputType: AgentStructuredOutputSchema,
    tools: [tools.getTaskContext, tools.validateUnlockPlan, tools.saveUnlockPlan],
    modelSettings: {
      parallelToolCalls: false,
    },
  })
}
