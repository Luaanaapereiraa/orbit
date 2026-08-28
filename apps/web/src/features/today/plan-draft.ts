import type { DailyPlan, Task } from '@destravai/core'

export type PlanDraft = {
  essentialTaskId: string | null
  secondaryTaskIds: string[]
}

export type PlanOp =
  | { type: 'move-active'; taskId: string }
  | { type: 'set-essential'; taskId: string | null }
  | { type: 'remove-secondary'; taskId: string }
  | { type: 'add-secondary'; taskId: string }

export function emptyPlanDraft(): PlanDraft {
  return { essentialTaskId: null, secondaryTaskIds: [] }
}

export function draftFromPlan(plan: DailyPlan | null): PlanDraft {
  if (!plan) {
    return emptyPlanDraft()
  }

  return {
    essentialTaskId: plan.essentialTaskId,
    secondaryTaskIds: plan.secondaryTaskIds.slice(0, 2),
  }
}

export function isTaskInDraft(draft: PlanDraft, taskId: string) {
  return (
    draft.essentialTaskId === taskId || draft.secondaryTaskIds.includes(taskId)
  )
}

export function diffPlanDraft(
  current: DailyPlan | null,
  draft: PlanDraft,
  tasks: readonly Task[],
): PlanOp[] {
  const ops: PlanOp[] = []
  const currentEssential = current?.essentialTaskId ?? null
  const currentSecondaries = current?.secondaryTaskIds ?? []
  const draftIds = [draft.essentialTaskId, ...draft.secondaryTaskIds].filter(
    (id): id is string => !!id,
  )

  for (const taskId of draftIds) {
    const task = tasks.find((item) => item.id === taskId)

    if (task?.status === 'inbox') {
      ops.push({ type: 'move-active', taskId })
    }
  }

  if (draft.essentialTaskId !== currentEssential) {
    ops.push({ type: 'set-essential', taskId: draft.essentialTaskId })
  }

  for (const taskId of currentSecondaries) {
    if (
      !draft.secondaryTaskIds.includes(taskId) &&
      taskId !== draft.essentialTaskId
    ) {
      ops.push({ type: 'remove-secondary', taskId })
    }
  }

  for (const taskId of draft.secondaryTaskIds) {
    if (
      !currentSecondaries.includes(taskId) &&
      taskId !== draft.essentialTaskId
    ) {
      ops.push({ type: 'add-secondary', taskId })
    }
  }

  return ops
}
