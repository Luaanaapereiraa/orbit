import type { Task } from '../tasks/types'

export function canTaskEnterPlan(
  task: Task | null | undefined,
): task is Task {
  return !!task && task.status !== 'done' && task.status !== 'archived'
}
