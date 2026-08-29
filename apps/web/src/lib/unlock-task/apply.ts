import type { UnlockPlan } from '@destravai/contracts'
import type { Task, TaskEnergy } from '@destravai/core'

export interface UnlockPlanTaskPatch {
  nextAction: string
  energy: TaskEnergy
  estimatedMinutes: number
}

export function unlockPlanTaskPatch(plan: UnlockPlan): UnlockPlanTaskPatch {
  return {
    nextAction: plan.nextAction,
    energy: plan.energy,
    estimatedMinutes: plan.recommendedFocusMinutes,
  }
}

export function applyUnlockPlanToTask(
  task: Task,
  plan: UnlockPlan,
  update: {
    updateTaskNextAction: (taskId: string, nextAction: string | null) => void
    updateTaskEnergy: (taskId: string, energy: TaskEnergy | null) => void
    updateTaskEstimatedMinutes: (
      taskId: string,
      estimatedMinutes: number | null,
    ) => void
  },
) {
  const patch = unlockPlanTaskPatch(plan)
  update.updateTaskNextAction(task.id, patch.nextAction)
  update.updateTaskEnergy(task.id, patch.energy)
  update.updateTaskEstimatedMinutes(task.id, patch.estimatedMinutes)
}
