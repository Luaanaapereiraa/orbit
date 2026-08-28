import { Agent, tool, type RunContext } from '@openai/agents'
import { z } from 'zod'
import { UnlockPlanSchema } from '@destravai/contracts'
import type { AppConfig } from '../../config/env.js'
import type { UnlockRunContext } from './context.js'
import { unlockAgentInstructions } from './instructions.js'
import { AgentStructuredOutputSchema, EmptyArgsSchema } from './schemas.js'
import { readTrustedTaskContext } from './tools/get-task-context.js'
import { saveValidatedUnlockPlan } from './tools/save-unlock-plan.js'
import { applyValidatedPlan } from './tools/validate-unlock-plan.js'

export const UNLOCK_TOOL_CONCURRENCY = 1

function requireContext(ctx: RunContext<UnlockRunContext> | undefined) {
  if (!ctx) {
    throw new Error('missing_run_context')
  }
  return ctx.context
}

export function createUnlockTaskTools() {
  const getTaskContext = tool<typeof EmptyArgsSchema, UnlockRunContext>({
    name: 'get_task_context',
    description:
      'Read the trusted task context for this run. Call this before proposing a plan.',
    parameters: EmptyArgsSchema,
    strict: true,
    execute: async (_args, ctx) => readTrustedTaskContext(requireContext(ctx)),
  })

  const validateUnlockPlan = tool<
    z.ZodObject<{ plan: typeof UnlockPlanSchema }>,
    UnlockRunContext
  >({
    name: 'validate_unlock_plan',
    description: 'Validate a proposed unlock plan against deterministic rules.',
    parameters: z.object({ plan: UnlockPlanSchema }).strict(),
    strict: true,
    execute: async ({ plan }, ctx) =>
      applyValidatedPlan(requireContext(ctx), plan),
  })

  const saveUnlockPlan = tool<
    z.ZodObject<{ plan: typeof UnlockPlanSchema }>,
    UnlockRunContext
  >({
    name: 'save_unlock_plan',
    description:
      'Persist a previously validated plan. The plan must match the last validated hash.',
    parameters: z.object({ plan: UnlockPlanSchema }).strict(),
    strict: true,
    execute: async ({ plan }, ctx) =>
      saveValidatedUnlockPlan(requireContext(ctx), plan),
  })

  return { getTaskContext, validateUnlockPlan, saveUnlockPlan }
}

export function createUnlockTaskAgent(
  config: AppConfig,
  locale: 'pt-BR' | 'en-US',
) {
  const tools = createUnlockTaskTools()

  return new Agent<UnlockRunContext, typeof AgentStructuredOutputSchema>({
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
