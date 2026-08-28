import type { Task } from '../tasks/types'

export type { Task }

export type CycleType = 'focus' | 'shortBreak' | 'longBreak'

export interface Cycle {
  id: string
  type: CycleType
  task: string
  taskId?: string
  minutesAmount: number
  startDate: Date
  pausedMs: number
  pausedAt?: Date
  interruptedDate?: Date
  finishedDate?: Date
}

export interface Settings {
  focusMinutes: number
  shortBreakMinutes: number
  longBreakMinutes: number
  cyclesUntilLongBreak: number
  autoStartBreaks: boolean
  soundEnabled: boolean
  notificationsEnabled: boolean
  theme: 'light' | 'dark'
}

export interface PomodoroState {
  cycles: Cycle[]
  activeCycleId: string | null
  selectedTaskId: string | null
  tasks: Task[]
  settings: Settings
}

export const defaultSettings: Settings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  cyclesUntilLongBreak: 4,
  autoStartBreaks: true,
  soundEnabled: true,
  notificationsEnabled: true,
  theme: 'dark',
}

export const initialPomodoroState: PomodoroState = {
  cycles: [],
  activeCycleId: null,
  selectedTaskId: null,
  tasks: [],
  settings: defaultSettings,
}

export const ActionTypes = {
  ADD_NEW_CYCLE: 'ADD_NEW_CYCLE',
  INTERRUPT_CURRENT_CYCLE: 'INTERRUPT_CURRENT_CYCLE',
  FINISH_CYCLE: 'FINISH_CYCLE',
  PAUSE_CURRENT_CYCLE: 'PAUSE_CURRENT_CYCLE',
  RESUME_CURRENT_CYCLE: 'RESUME_CURRENT_CYCLE',
  CLEAR_HISTORY: 'CLEAR_HISTORY',
  ADD_TASK: 'ADD_TASK',
  SELECT_TASK: 'SELECT_TASK',
  DELETE_TASK: 'DELETE_TASK',
  UPDATE_SETTINGS: 'UPDATE_SETTINGS',
  HYDRATE_STATE: 'HYDRATE_STATE',
} as const

export type PomodoroAction =
  | { type: typeof ActionTypes.ADD_NEW_CYCLE; payload: { newCycle: Cycle } }
  | { type: typeof ActionTypes.INTERRUPT_CURRENT_CYCLE }
  | {
      type: typeof ActionTypes.FINISH_CYCLE
      payload: { nextCycle?: Cycle }
    }
  | { type: typeof ActionTypes.PAUSE_CURRENT_CYCLE }
  | { type: typeof ActionTypes.RESUME_CURRENT_CYCLE }
  | { type: typeof ActionTypes.CLEAR_HISTORY }
  | { type: typeof ActionTypes.ADD_TASK; payload: { task: Task } }
  | { type: typeof ActionTypes.SELECT_TASK; payload: { taskId: string } }
  | { type: typeof ActionTypes.DELETE_TASK; payload: { taskId: string } }
  | {
      type: typeof ActionTypes.UPDATE_SETTINGS
      payload: { settings: Partial<Settings> }
    }
  | {
      type: typeof ActionTypes.HYDRATE_STATE
      payload: { state: PomodoroState }
    }
