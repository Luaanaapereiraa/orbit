import type { UnlockTaskRunRequest } from '@destravai/contracts'
import type { UnlockRunContext } from '../context.js'

const TITLE_MAX = 200
const NEXT_ACTION_MAX = 160
const DETAILS_MAX = 280

function clip(value: string, max: number) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.slice(0, max)
}

export function readTrustedTaskContext(context: UnlockRunContext) {
  const { request } = context
  context.taskContextRead = true
  context.protocol.push('get_task_context')

  return sanitizeTaskContext(request)
}

export function sanitizeTaskContext(request: UnlockTaskRunRequest) {
  return {
    title: clip(request.task.title, TITLE_MAX),
    nextAction: request.task.nextAction
      ? clip(request.task.nextAction, NEXT_ACTION_MAX)
      : null,
    energy: request.task.energy,
    estimatedMinutes: request.task.estimatedMinutes,
    status: request.task.status,
    blockageReason: request.blockageReason,
    blockageDetails: request.blockageDetails
      ? clip(request.blockageDetails, DETAILS_MAX)
      : null,
    availableMinutes: request.availableMinutes,
    currentEnergy: request.currentEnergy,
    todayRole: request.today.role,
    plannedTaskCount: request.today.plannedTaskCount,
    locale: request.locale,
  }
}
