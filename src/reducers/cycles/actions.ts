import { ActionTypes, Cycle, CyclesAction } from './reducer'

export function addNewCycleAction(newCycle: Cycle): CyclesAction {
  return {
    type: ActionTypes.ADD_NEW_CYCLE,
    payload: {
      newCycle,
    },
  }
}

export function interruptCurrentCycleAction(): CyclesAction {
  return {
    type: ActionTypes.INTERRUPT_CURRENT_CYCLE,
  }
}

export function markCurrentCycleAsFinishedAction(): CyclesAction {
  return {
    type: ActionTypes.MARK_CURRENT_CYCLE_AS_FINISHED,
  }
}

export function clearHistoryAction(): CyclesAction {
  return {
    type: ActionTypes.CLEAR_HISTORY,
  }
}
