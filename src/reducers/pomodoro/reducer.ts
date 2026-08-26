import {
  ActionTypes,
  PomodoroAction,
  PomodoroState,
} from './types'

function patchActiveCycle(
  state: PomodoroState,
  patch: (cycle: PomodoroState['cycles'][number]) => PomodoroState['cycles'][number],
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
            ...cycle,
            interruptedDate: new Date(),
            pausedAt: undefined,
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
              ...cycle,
              interruptedDate: new Date(),
              pausedAt: undefined,
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
            ...cycle,
            finishedDate: new Date(),
            pausedAt: undefined,
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
        cycles: state.cycles.filter((cycle) => cycle.id === state.activeCycleId),
      }

    case ActionTypes.ADD_TASK:
      return {
        ...state,
        tasks: [...state.tasks, action.payload.task],
        selectedTaskId: action.payload.task.id,
      }

    case ActionTypes.SELECT_TASK:
      return {
        ...state,
        selectedTaskId: action.payload.taskId,
      }

    case ActionTypes.DELETE_TASK:
      return {
        ...state,
        tasks: state.tasks.filter((task) => task.id !== action.payload.taskId),
        selectedTaskId:
          state.selectedTaskId === action.payload.taskId
            ? null
            : state.selectedTaskId,
      }

    case ActionTypes.UPDATE_SETTINGS:
      return {
        ...state,
        settings: {
          ...state.settings,
          ...action.payload.settings,
        },
      }

    default:
      return state
  }
}
