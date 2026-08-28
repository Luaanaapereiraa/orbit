import { createHash } from 'node:crypto'
import type { UnlockPlan } from '@destravai/contracts'

export function canonicalizeUnlockPlan(plan: UnlockPlan): string {
  return JSON.stringify({
    title: plan.title,
    summary: plan.summary,
    nextAction: plan.nextAction,
    steps: plan.steps.map((step) => ({
      order: step.order,
      title: step.title,
      minutes: step.minutes,
    })),
    totalMinutes: plan.totalMinutes,
    recommendedFocusMinutes: plan.recommendedFocusMinutes,
    energy: plan.energy,
    supportiveMessage: plan.supportiveMessage,
  })
}

export function hashUnlockPlan(plan: UnlockPlan): string {
  return createHash('sha256').update(canonicalizeUnlockPlan(plan)).digest('hex')
}
