import type { UnlockTaskRunRequest } from '@destravai/contracts'
import type { AgentRunRepository } from './repositories/types.js'

export interface UnlockRunContext {
  runId: string
  userId: string
  request: UnlockTaskRunRequest
  repository: AgentRunRepository
  taskContextRead: boolean
  validatedPlanHash: string | null
  savedPlanId: string | null
  protocol: Array<
    | 'get_task_context'
    | 'validate_unlock_plan'
    | 'save_unlock_plan'
  >
}

export function createUnlockRunContext(input: {
  runId: string
  userId: string
  request: UnlockTaskRunRequest
  repository: AgentRunRepository
}): UnlockRunContext {
  return {
    runId: input.runId,
    userId: input.userId,
    request: input.request,
    repository: input.repository,
    taskContextRead: false,
    validatedPlanHash: null,
    savedPlanId: null,
    protocol: [],
  }
}
