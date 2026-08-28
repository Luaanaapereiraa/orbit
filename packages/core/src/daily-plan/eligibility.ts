import type { Task } from '../tasks/types'

export function canTaskEnterPlan(
  task: Task | null | undefined,
): task is Task {
  return !!task && (task.status === 'inbox' || task.status === 'active')
}

export function canTaskRemainInPlan(
  task: Task | null | undefined,
): task is Task {
  return !!task
}
