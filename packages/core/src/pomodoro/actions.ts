import {
  ActionTypes,
  Cycle,
  PomodoroAction,
  Settings,
  Task,
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

export function addTaskAction(task: Task): PomodoroAction {
  return {
    type: ActionTypes.ADD_TASK,
    payload: { task },
  }
}

export function selectTaskAction(taskId: string): PomodoroAction {
  return {
    type: ActionTypes.SELECT_TASK,
    payload: { taskId },
  }
}

export function deleteTaskAction(taskId: string): PomodoroAction {
  return {
    type: ActionTypes.DELETE_TASK,
    payload: { taskId },
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
