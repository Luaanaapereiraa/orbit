import {
  addDailyPlanSecondary,
  clearInvalidPlanReferences,
  isValidLocalDateKey,
  removeDailyPlanSecondary,
  removeTaskFromCurrentAndFuturePlans,
  removeTaskFromPlans,
  setDailyPlanEssential,
  upsertDailyPlan,
} from '../daily-plan'
import {
  addTaskToList,
  archiveTaskInList,
  completeTaskInList,
  deleteTaskFromList,
  moveTaskBetweenInboxAndActive,
  reopenTaskInList,
  reorderTasksByIds,
  applyUnlockPlanToTask,
  updateTaskEnergy,
  updateTaskEstimatedMinutes,
  updateTaskNextAction,
  updateTaskTitle,
} from '../tasks'
import { Cycle, ActionTypes, PomodoroAction, PomodoroState } from './types'

function settlePause(cycle: Cycle): Cycle {
  if (!cycle.pausedAt) {
    return cycle
  }

  return {
    ...cycle,
    pausedMs:
      cycle.pausedMs + (Date.now() - new Date(cycle.pausedAt).getTime()),
    pausedAt: undefined,
  }
}

function patchActiveCycle(
  state: PomodoroState,
  patch: (
    cycle: PomodoroState['cycles'][number],
  ) => PomodoroState['cycles'][number],
) {
  if (!state.activeCycleId) {
    return state
  }

  return {
    ...state,
    cycles: state.cycles.map((cycle) =>
      cycle.id === state.activeCycleId ? patch(cycle) : cycle,
    ),
  }
}

function withTasksAndPlans(
  state: PomodoroState,
  tasks: PomodoroState['tasks'],
  dailyPlans: PomodoroState['dailyPlans'],
  selectedTaskId = state.selectedTaskId,
): PomodoroState {
  return {
    ...state,
    tasks,
    dailyPlans,
    selectedTaskId,
  }
}

function selectedIfVisible(
  tasks: PomodoroState['tasks'],
  selectedTaskId: string | null,
) {
  if (!selectedTaskId) {
    return null
  }

  const selected = tasks.find((task) => task.id === selectedTaskId)

  if (
    !selected ||
    selected.status === 'done' ||
    selected.status === 'archived'
  ) {
    return null
  }

  return selectedTaskId
}

export function pomodoroReducer(state: PomodoroState, action: PomodoroAction) {
  switch (action.type) {
    case ActionTypes.ADD_NEW_CYCLE: {
      const cycles = state.cycles.map((cycle) => {
        if (
          cycle.id === state.activeCycleId &&
          !cycle.finishedDate &&
          !cycle.interruptedDate
        ) {
          return {
            ...settlePause(cycle),
            interruptedDate: new Date(),
          }
        }

        return cycle
      })

      return {
        ...state,
        cycles: [...cycles, action.payload.newCycle],
        activeCycleId: action.payload.newCycle.id,
      }
    }

    case ActionTypes.INTERRUPT_CURRENT_CYCLE: {
      if (!state.activeCycleId) {
        return state
      }

      return {
        ...state,
        cycles: state.cycles.map((cycle) => {
          if (cycle.id === state.activeCycleId) {
            return {
              ...settlePause(cycle),
              interruptedDate: new Date(),
            }
          }

          return cycle
        }),
        activeCycleId: null,
      }
    }

    case ActionTypes.FINISH_CYCLE: {
      if (!state.activeCycleId) {
        return state
      }

      const cycles = state.cycles.map((cycle) => {
        if (cycle.id === state.activeCycleId) {
          return {
            ...settlePause(cycle),
            finishedDate: new Date(),
          }
        }

        return cycle
      })

      if (action.payload.nextCycle) {
        return {
          ...state,
          cycles: [...cycles, action.payload.nextCycle],
          activeCycleId: action.payload.nextCycle.id,
        }
      }

      return {
        ...state,
        cycles,
        activeCycleId: null,
      }
    }

    case ActionTypes.PAUSE_CURRENT_CYCLE:
      return patchActiveCycle(state, (cycle) => {
        if (cycle.pausedAt || cycle.finishedDate || cycle.interruptedDate) {
          return cycle
        }

        return { ...cycle, pausedAt: new Date() }
      })

    case ActionTypes.RESUME_CURRENT_CYCLE:
      return patchActiveCycle(state, (cycle) => {
        if (!cycle.pausedAt) {
          return cycle
        }

        const extraPause = Date.now() - new Date(cycle.pausedAt).getTime()

        return {
          ...cycle,
          pausedMs: cycle.pausedMs + extraPause,
          pausedAt: undefined,
        }
      })

    case ActionTypes.CLEAR_HISTORY:
      return {
        ...state,
        cycles: state.cycles.filter(
          (cycle) => cycle.id === state.activeCycleId,
        ),
      }

    case ActionTypes.ADD_TASK: {
      const tasks = addTaskToList(state.tasks, action.payload)

      if (!tasks) {
        return state
      }

      return {
        ...state,
        tasks,
        selectedTaskId: action.payload.id,
      }
    }

    case ActionTypes.SELECT_TASK:
      return {
        ...state,
        selectedTaskId: action.payload.taskId,
      }

    case ActionTypes.DELETE_TASK: {
      const tasks = deleteTaskFromList(state.tasks, action.payload.taskId)

      if (tasks === state.tasks) {
        return state
      }

      return withTasksAndPlans(
        state,
        tasks,
        removeTaskFromPlans(
          state.dailyPlans,
          action.payload.taskId,
          action.payload.now,
        ),
        state.selectedTaskId === action.payload.taskId
          ? null
          : state.selectedTaskId,
      )
    }

    case ActionTypes.UPDATE_TASK_TITLE:
      return withTasksAndPlans(
        state,
        updateTaskTitle(
          state.tasks,
          action.payload.taskId,
          action.payload.title,
          action.payload.now,
        ),
        state.dailyPlans,
      )

    case ActionTypes.UPDATE_TASK_NEXT_ACTION:
      return withTasksAndPlans(
        state,
        updateTaskNextAction(
          state.tasks,
          action.payload.taskId,
          action.payload.nextAction,
          action.payload.now,
        ),
        state.dailyPlans,
      )

    case ActionTypes.UPDATE_TASK_ESTIMATED_MINUTES:
      return withTasksAndPlans(
        state,
        updateTaskEstimatedMinutes(
          state.tasks,
          action.payload.taskId,
          action.payload.estimatedMinutes,
          action.payload.now,
        ),
        state.dailyPlans,
      )

    case ActionTypes.UPDATE_TASK_ENERGY:
      return withTasksAndPlans(
        state,
        updateTaskEnergy(
          state.tasks,
          action.payload.taskId,
          action.payload.energy,
          action.payload.now,
        ),
        state.dailyPlans,
      )

    case ActionTypes.APPLY_UNLOCK_PLAN:
      return withTasksAndPlans(
        state,
        applyUnlockPlanToTask(state.tasks, action.payload),
        state.dailyPlans,
      )

    case ActionTypes.MOVE_TASK_TO_INBOX:
      return withTasksAndPlans(
        state,
        moveTaskBetweenInboxAndActive(
          state.tasks,
          action.payload.taskId,
          'inbox',
          action.payload.now,
        ),
        state.dailyPlans,
      )

    case ActionTypes.MOVE_TASK_TO_ACTIVE:
      return withTasksAndPlans(
        state,
        moveTaskBetweenInboxAndActive(
          state.tasks,
          action.payload.taskId,
          'active',
          action.payload.now,
        ),
        state.dailyPlans,
      )

    case ActionTypes.REORDER_TASKS:
      return withTasksAndPlans(
        state,
        reorderTasksByIds(
          state.tasks,
          action.payload.orderedIds,
          action.payload.now,
        ),
        state.dailyPlans,
      )

    case ActionTypes.COMPLETE_TASK: {
      const tasks = completeTaskInList(
        state.tasks,
        action.payload.taskId,
        action.payload.now,
      )

      if (tasks === state.tasks) {
        return state
      }

      return withTasksAndPlans(
        state,
        tasks,
        state.dailyPlans,
        selectedIfVisible(tasks, state.selectedTaskId),
      )
    }

    case ActionTypes.REOPEN_TASK:
      return withTasksAndPlans(
        state,
        reopenTaskInList(
          state.tasks,
          action.payload.taskId,
          action.payload.now,
          action.payload.destination,
        ),
        state.dailyPlans,
      )

    case ActionTypes.ARCHIVE_TASK: {
      if (!isValidLocalDateKey(action.payload.currentDateKey)) {
        return state
      }

      const tasks = archiveTaskInList(
        state.tasks,
        action.payload.taskId,
        action.payload.now,
      )

      if (tasks === state.tasks) {
        return state
      }

      return withTasksAndPlans(
        state,
        tasks,
        removeTaskFromCurrentAndFuturePlans(
          state.dailyPlans,
          action.payload.taskId,
          action.payload.currentDateKey,
          action.payload.now,
        ),
        selectedIfVisible(tasks, state.selectedTaskId),
      )
    }

    case ActionTypes.UPSERT_DAILY_PLAN:
      return {
        ...state,
        dailyPlans: upsertDailyPlan(state.dailyPlans, action.payload, state.tasks),
      }

    case ActionTypes.SET_DAILY_PLAN_ESSENTIAL:
      return {
        ...state,
        dailyPlans: setDailyPlanEssential(
          state.dailyPlans,
          action.payload.date,
          action.payload.taskId,
          action.payload.now,
          state.tasks,
        ),
      }

    case ActionTypes.ADD_DAILY_PLAN_SECONDARY:
      return {
        ...state,
        dailyPlans: addDailyPlanSecondary(
          state.dailyPlans,
          action.payload.date,
          action.payload.taskId,
          action.payload.now,
          state.tasks,
        ),
      }

    case ActionTypes.REMOVE_DAILY_PLAN_SECONDARY:
      return {
        ...state,
        dailyPlans: removeDailyPlanSecondary(
          state.dailyPlans,
          action.payload.date,
          action.payload.taskId,
          action.payload.now,
          state.tasks,
        ),
      }

    case ActionTypes.CLEAR_INVALID_PLAN_REFERENCES:
      return {
        ...state,
        dailyPlans: clearInvalidPlanReferences(
          state.dailyPlans,
          state.tasks,
          action.payload.now,
        ),
      }

    case ActionTypes.UPDATE_SETTINGS:
      return {
        ...state,
        settings: {
          ...state.settings,
          ...action.payload.settings,
        },
      }

    case ActionTypes.HYDRATE_STATE:
      return action.payload.state

    default:
      return state
  }
}
