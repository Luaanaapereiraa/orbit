import type { UnlockPlan } from '@destravai/contracts'
import type { UnlockRunContext } from '../context.js'
import { hashUnlockPlan } from '../plan-hash.js'
import { validateUnlockPlanDeterministic } from './validate-unlock-plan.js'

export async function saveValidatedUnlockPlan(
  context: UnlockRunContext,
  plan: UnlockPlan,
  generationMode: 'agent' | 'fallback' = 'agent',
) {
  if (generationMode === 'agent' && context.cancelled) {
    return {
      saved: false as const,
      error: 'cancelled',
    }
  }

  if (!context.taskContextRead) {
    return {
      saved: false as const,
      error: 'context_not_read',
    }
  }

  if (!context.validatedPlanHash) {
    return {
      saved: false as const,
      error: 'plan_not_validated',
    }
  }

  const fresh = validateUnlockPlanDeterministic(plan, context.request)
  if (!fresh.valid || !fresh.planHash) {
    return {
      saved: false as const,
      error: 'plan_invalid',
    }
  }

  if (fresh.planHash !== context.validatedPlanHash) {
    return {
      saved: false as const,
      error: 'plan_hash_mismatch',
    }
  }

  if (hashUnlockPlan(plan) !== context.validatedPlanHash) {
    return {
      saved: false as const,
      error: 'plan_hash_mismatch',
    }
  }

  if (generationMode === 'agent' && context.cancelled) {
    return {
      saved: false as const,
      error: 'cancelled',
    }
  }

  const saved = await context.repository.savePlan({
    runId: context.runId,
    userId: context.userId,
    plan,
    generationMode,
  })

  if (saved.kind === 'rejected') {
    return {
      saved: false as const,
      error: saved.reason,
    }
  }

  context.savedPlanId = saved.planId
  context.protocol.push('save_unlock_plan')

  return {
    saved: true as const,
    planId: saved.planId,
    runId: context.runId,
    plan: saved.plan,
  }
}
