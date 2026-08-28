import { UnlockTaskRunResponseSchema, type UnlockPlan } from '@destravai/contracts'
import { validateUnlockPlanDeterministic } from '../tools/validate-unlock-plan.js'
import type { UnlockRunContext } from '../context.js'
import { hashUnlockPlan } from '../plan-hash.js'

export function assertCompletedProtocol(context: UnlockRunContext) {
  if (context.protocol[0] !== 'get_task_context') {
    return false
  }
  if (!context.taskContextRead || !context.validatedPlanHash || !context.savedPlanId) {
    return false
  }
  const validateIndex = context.protocol.lastIndexOf('validate_unlock_plan')
  const saveIndex = context.protocol.lastIndexOf('save_unlock_plan')
  return validateIndex > 0 && saveIndex > validateIndex
}

export function assertOutputMatchesSavedPlan(
  context: UnlockRunContext,
  plan: UnlockPlan,
) {
  if (!context.savedPlanId || !context.validatedPlanHash) {
    return false
  }
  return hashUnlockPlan(plan) === context.validatedPlanHash
}

export function inspectCompletedPlan(
  context: UnlockRunContext,
  plan: UnlockPlan,
) {
  const validation = validateUnlockPlanDeterministic(plan, context.request)
  if (!validation.valid) {
    return { ok: false as const, errors: validation.errors }
  }
  if (!assertCompletedProtocol(context)) {
    return { ok: false as const, errors: ['protocol'] }
  }
  if (!assertOutputMatchesSavedPlan(context, plan)) {
    return { ok: false as const, errors: ['saved_mismatch'] }
  }
  return { ok: true as const, errors: [] }
}

export function parseAgentResponsePayload(value: unknown) {
  return UnlockTaskRunResponseSchema.safeParse(value)
}
