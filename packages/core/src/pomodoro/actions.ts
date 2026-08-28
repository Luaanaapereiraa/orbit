import { TaskEnergy } from '../tasks/types'
import {
  ActionTypes,
  Cycle,
  PomodoroAction,
  PomodoroState,
  Settings,
} from './types'

export function addNewCycleAction(newCycle: Cycle): PomodoroAction {
  return {
    type: ActionTypes.ADD_NEW_CYCLE,
    payload: { newCycle },
  }
}

export function interruptCurrentCycleAction(): PomodoroAction {
  return { type: ActionTypes.INTERRUPT_CURRENT_CYCLE }
}

export function finishCycleAction(nextCycle?: Cycle): PomodoroAction {
  return {
    type: ActionTypes.FINISH_CYCLE,
    payload: { nextCycle },
  }
}

export function pauseCurrentCycleAction(): PomodoroAction {
  return { type: ActionTypes.PAUSE_CURRENT_CYCLE }
}

export function resumeCurrentCycleAction(): PomodoroAction {
  return { type: ActionTypes.RESUME_CURRENT_CYCLE }
}

export function clearHistoryAction(): PomodoroAction {
  return { type: ActionTypes.CLEAR_HISTORY }
}

export function addTaskAction(task: {
  id: string
  title: string
  now: string
  status?: 'inbox' | 'active'
  nextAction?: string | null
  estimatedMinutes?: number | null
  energy?: TaskEnergy | null
}): PomodoroAction {
  return {
    type: ActionTypes.ADD_TASK,
    payload: task,
  }
}

export function selectTaskAction(taskId: string): PomodoroAction {
  return {
    type: ActionTypes.SELECT_TASK,
    payload: { taskId },
  }
}

export function deleteTaskAction(taskId: string, now: string): PomodoroAction {
  return {
    type: ActionTypes.DELETE_TASK,
    payload: { taskId, now },
  }
}

export function updateTaskTitleAction(
  taskId: string,
  title: string,
  now: string,
): PomodoroAction {
  return {
    type: ActionTypes.UPDATE_TASK_TITLE,
    payload: { taskId, title, now },
  }
}

export function updateTaskNextActionAction(
  taskId: string,
  nextAction: string | null,
  now: string,
): PomodoroAction {
  return {
    type: ActionTypes.UPDATE_TASK_NEXT_ACTION,
    payload: { taskId, nextAction, now },
  }
}

export function updateTaskEstimatedMinutesAction(
  taskId: string,
  estimatedMinutes: number | null,
  now: string,
): PomodoroAction {
  return {
    type: ActionTypes.UPDATE_TASK_ESTIMATED_MINUTES,
    payload: { taskId, estimatedMinutes, now },
  }
}

export function updateTaskEnergyAction(
  taskId: string,
  energy: TaskEnergy | null,
  now: string,
): PomodoroAction {
  return {
    type: ActionTypes.UPDATE_TASK_ENERGY,
    payload: { taskId, energy, now },
  }
}

export function moveTaskToInboxAction(
  taskId: string,
  now: string,
): PomodoroAction {
  return {
    type: ActionTypes.MOVE_TASK_TO_INBOX,
    payload: { taskId, now },
  }
}

export function moveTaskToActiveAction(
  taskId: string,
  now: string,
): PomodoroAction {
  return {
    type: ActionTypes.MOVE_TASK_TO_ACTIVE,
    payload: { taskId, now },
  }
}

export function reorderTasksAction(
  orderedIds: string[],
  now: string,
): PomodoroAction {
  return {
    type: ActionTypes.REORDER_TASKS,
    payload: { orderedIds, now },
  }
}

export function completeTaskAction(
  taskId: string,
  now: string,
): PomodoroAction {
  return {
    type: ActionTypes.COMPLETE_TASK,
    payload: { taskId, now },
  }
}

export function reopenTaskAction(
  taskId: string,
  now: string,
  destination: 'active' | 'inbox',
): PomodoroAction {
  return {
    type: ActionTypes.REOPEN_TASK,
    payload: { taskId, now, destination },
  }
}

export function archiveTaskAction(
  taskId: string,
  now: string,
  currentDateKey: string,
): PomodoroAction {
  return {
    type: ActionTypes.ARCHIVE_TASK,
    payload: { taskId, now, currentDateKey },
  }
}

export function upsertDailyPlanAction(plan: {
  date: string
  now: string
  essentialTaskId?: string | null
  secondaryTaskIds?: string[]
}): PomodoroAction {
  return {
    type: ActionTypes.UPSERT_DAILY_PLAN,
    payload: plan,
  }
}

export function setDailyPlanEssentialAction(
  date: string,
  taskId: string | null,
  now: string,
): PomodoroAction {
  return {
    type: ActionTypes.SET_DAILY_PLAN_ESSENTIAL,
    payload: { date, taskId, now },
  }
}

export function addDailyPlanSecondaryAction(
  date: string,
  taskId: string,
  now: string,
): PomodoroAction {
  return {
    type: ActionTypes.ADD_DAILY_PLAN_SECONDARY,
    payload: { date, taskId, now },
  }
}

export function removeDailyPlanSecondaryAction(
  date: string,
  taskId: string,
  now: string,
): PomodoroAction {
  return {
    type: ActionTypes.REMOVE_DAILY_PLAN_SECONDARY,
    payload: { date, taskId, now },
  }
}

export function clearInvalidPlanReferencesAction(now: string): PomodoroAction {
  return {
    type: ActionTypes.CLEAR_INVALID_PLAN_REFERENCES,
    payload: { now },
  }
}

export function updateSettingsAction(
  settings: Partial<Settings>,
): PomodoroAction {
  return {
    type: ActionTypes.UPDATE_SETTINGS,
    payload: { settings },
  }
}

export function hydratePomodoroStateAction(
  state: PomodoroState,
): PomodoroAction {
  return {
    type: ActionTypes.HYDRATE_STATE,
    payload: { state },
  }
}
