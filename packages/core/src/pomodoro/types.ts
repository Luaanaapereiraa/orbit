import type { DailyPlan } from '../daily-plan/types'
import type { Task, TaskEnergy } from '../tasks/types'

export type { DailyPlan, Task, TaskEnergy }
export type { TaskStatus } from '../tasks/types'

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
  dailyPlans: DailyPlan[]
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
  dailyPlans: [],
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
  UPDATE_TASK_TITLE: 'UPDATE_TASK_TITLE',
  UPDATE_TASK_NEXT_ACTION: 'UPDATE_TASK_NEXT_ACTION',
  UPDATE_TASK_ESTIMATED_MINUTES: 'UPDATE_TASK_ESTIMATED_MINUTES',
  UPDATE_TASK_ENERGY: 'UPDATE_TASK_ENERGY',
  APPLY_UNLOCK_PLAN: 'APPLY_UNLOCK_PLAN',
  MOVE_TASK_TO_INBOX: 'MOVE_TASK_TO_INBOX',
  MOVE_TASK_TO_ACTIVE: 'MOVE_TASK_TO_ACTIVE',
  REORDER_TASKS: 'REORDER_TASKS',
  COMPLETE_TASK: 'COMPLETE_TASK',
  REOPEN_TASK: 'REOPEN_TASK',
  ARCHIVE_TASK: 'ARCHIVE_TASK',
  UPSERT_DAILY_PLAN: 'UPSERT_DAILY_PLAN',
  SET_DAILY_PLAN_ESSENTIAL: 'SET_DAILY_PLAN_ESSENTIAL',
  ADD_DAILY_PLAN_SECONDARY: 'ADD_DAILY_PLAN_SECONDARY',
  REMOVE_DAILY_PLAN_SECONDARY: 'REMOVE_DAILY_PLAN_SECONDARY',
  CLEAR_INVALID_PLAN_REFERENCES: 'CLEAR_INVALID_PLAN_REFERENCES',
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
  | {
      type: typeof ActionTypes.ADD_TASK
      payload: {
        id: string
        title: string
        now: string
        status?: 'inbox' | 'active'
        nextAction?: string | null
        estimatedMinutes?: number | null
        energy?: TaskEnergy | null
      }
    }
  | { type: typeof ActionTypes.SELECT_TASK; payload: { taskId: string } }
  | {
      type: typeof ActionTypes.DELETE_TASK
      payload: { taskId: string; now: string }
    }
  | {
      type: typeof ActionTypes.UPDATE_TASK_TITLE
      payload: { taskId: string; title: string; now: string }
    }
  | {
      type: typeof ActionTypes.UPDATE_TASK_NEXT_ACTION
      payload: { taskId: string; nextAction: string | null; now: string }
    }
  | {
      type: typeof ActionTypes.UPDATE_TASK_ESTIMATED_MINUTES
      payload: { taskId: string; estimatedMinutes: number | null; now: string }
    }
  | {
      type: typeof ActionTypes.UPDATE_TASK_ENERGY
      payload: { taskId: string; energy: TaskEnergy | null; now: string }
    }
  | {
      type: typeof ActionTypes.APPLY_UNLOCK_PLAN
      payload: {
        taskId: string
        nextAction: string
        estimatedMinutes: number
        energy: TaskEnergy
        now: string
      }
    }
  | {
      type: typeof ActionTypes.MOVE_TASK_TO_INBOX
      payload: { taskId: string; now: string }
    }
  | {
      type: typeof ActionTypes.MOVE_TASK_TO_ACTIVE
      payload: { taskId: string; now: string }
    }
  | {
      type: typeof ActionTypes.REORDER_TASKS
      payload: { orderedIds: string[]; now: string }
    }
  | {
      type: typeof ActionTypes.COMPLETE_TASK
      payload: { taskId: string; now: string }
    }
  | {
      type: typeof ActionTypes.REOPEN_TASK
      payload: {
        taskId: string
        now: string
        destination: 'active' | 'inbox'
      }
    }
  | {
      type: typeof ActionTypes.ARCHIVE_TASK
      payload: { taskId: string; now: string; currentDateKey: string }
    }
  | {
      type: typeof ActionTypes.UPSERT_DAILY_PLAN
      payload: {
        date: string
        now: string
        essentialTaskId?: string | null
        secondaryTaskIds?: string[]
      }
    }
  | {
      type: typeof ActionTypes.SET_DAILY_PLAN_ESSENTIAL
      payload: { date: string; taskId: string | null; now: string }
    }
  | {
      type: typeof ActionTypes.ADD_DAILY_PLAN_SECONDARY
      payload: { date: string; taskId: string; now: string }
    }
  | {
      type: typeof ActionTypes.REMOVE_DAILY_PLAN_SECONDARY
      payload: { date: string; taskId: string; now: string }
    }
  | {
      type: typeof ActionTypes.CLEAR_INVALID_PLAN_REFERENCES
      payload: { now: string }
    }
  | {
      type: typeof ActionTypes.UPDATE_SETTINGS
      payload: { settings: Partial<Settings> }
    }
  | {
      type: typeof ActionTypes.HYDRATE_STATE
      payload: { state: PomodoroState }
    }
