'use client'

import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import {
  addDailyPlanSecondaryAction,
  applyUnlockPlanToTask,
  applyUnlockPlanToTaskAction,
  addNewCycleAction,
  addTaskAction,
  archiveTaskAction,
  clearHistoryAction,
  completeTaskAction,
  deleteTaskAction,
  finishCycleAction,
  formatClock,
  getElapsedSeconds,
  getNextBreakType,
  hydratePomodoroStateAction,
  interruptCurrentCycleAction,
  moveTaskToActiveAction,
  pauseCurrentCycleAction,
  pomodoroReducer,
  removeDailyPlanSecondaryAction,
  reopenTaskAction,
  resumeCurrentCycleAction,
  selectTaskAction,
  setDailyPlanEssentialAction,
  updateSettingsAction,
  updateTaskEnergyAction,
  updateTaskEstimatedMinutesAction,
  updateTaskNextActionAction,
  updateTaskTitleAction,
  type Cycle,
  type DailyPlan,
  type PomodoroState,
  type Settings,
  type Task,
  type TaskEnergy,
  initialPomodoroState,
} from '@destravai/core'
import {
  applyThemeClass,
  loadPomodoroState,
  persistPomodoroState,
} from '../lib/storage'
import { APP_NAME } from '../lib/brand'
import { toLocalDateKey } from '../lib/local-date'
import {
  notifyCycleFinished,
  playFinishSound,
  requestNotificationPermission,
  unlockAudio,
} from '../utils/cycleAlerts'

export type StartFocusResult =
  | { status: 'started'; cycleId: string }
  | { status: 'active_cycle_exists'; cycleId: string }
  | { status: 'task_not_found' }
  | { status: 'task_not_eligible' }
  | { status: 'start_in_progress' }

export type ApplyUnlockPlanOutcome =
  | { status: 'applied'; taskId: string }
  | { status: 'task_not_found' }
  | { status: 'task_not_eligible' }

function nowIso() {
  return new Date().toISOString()
}

function currentDateKey() {
  return toLocalDateKey(new Date())
}

interface PomodoroContextType {
  hydrated: boolean
  cycles: Cycle[]
  activeCycle: Cycle | undefined
  activeCycleId: string | null
  amountSecondsPassed: number
  tasks: Task[]
  selectedTaskId: string | null
  dailyPlans: DailyPlan[]
  settings: Settings
  startFocus: () => void
  startFocusForTask: (taskId: string) => StartFocusResult
  pauseCurrentCycle: () => void
  resumeCurrentCycle: () => void
  interruptCurrentCycle: () => void
  skipCurrentCycle: () => void
  clearHistory: () => void
  addTask: (name: string) => void
  captureInboxTask: (title: string) => boolean
  selectTask: (taskId: string) => void
  deleteTask: (taskId: string) => void
  completeTask: (taskId: string) => void
  reopenTask: (taskId: string, destination?: 'active' | 'inbox') => void
  archiveTask: (taskId: string) => void
  updateTaskTitle: (taskId: string, title: string) => void
  updateTaskNextAction: (taskId: string, nextAction: string | null) => void
  updateTaskEnergy: (taskId: string, energy: TaskEnergy | null) => void
  updateTaskEstimatedMinutes: (
    taskId: string,
    estimatedMinutes: number | null,
  ) => void
  applyUnlockPlan: (input: {
    taskId: string
    nextAction: string
    estimatedMinutes: number
    energy: TaskEnergy
  }) => ApplyUnlockPlanOutcome
  moveTaskToActive: (taskId: string) => void
  setDailyPlanEssential: (dateKey: string, taskId: string | null) => void
  addDailyPlanSecondary: (dateKey: string, taskId: string) => void
  removeDailyPlanSecondary: (dateKey: string, taskId: string) => void
  updateSettings: (settings: Partial<Settings>) => void
}

export const PomodoroContext = createContext({} as PomodoroContextType)

interface PomodoroProviderProps {
  children: ReactNode
}

export function PomodoroProvider({ children }: PomodoroProviderProps) {
  const [state, dispatch] = useReducer(pomodoroReducer, initialPomodoroState)
  const [hydrated, setHydrated] = useState(false)
  const stateRef = useRef<PomodoroState>(state)
  stateRef.current = state
  const startFocusLockRef = useRef(false)

  useEffect(() => {
    return () => {
      startFocusLockRef.current = false
    }
  }, [])

  const { cycles, activeCycleId, selectedTaskId, tasks, dailyPlans, settings } =
    state
  const activeCycle = cycles.find((cycle) => cycle.id === activeCycleId)
  const selectedTask = tasks.find((task) => task.id === selectedTaskId)

  const [amountSecondsPassed, setAmountSecondsPassed] = useState(0)

  useEffect(() => {
    dispatch(hydratePomodoroStateAction(loadPomodoroState()))
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) {
      return
    }

    persistPomodoroState(state)
  }, [hydrated, state])

  useEffect(() => {
    if (!hydrated) {
      return
    }

    applyThemeClass(settings.theme)
  }, [hydrated, settings.theme])

  useEffect(() => {
    if (!hydrated) {
      return
    }

    if (!activeCycle) {
      document.title = APP_NAME
      setAmountSecondsPassed(0)
      return
    }

    const cycle: Cycle = activeCycle

    if (cycle.pausedAt) {
      const elapsed = getElapsedSeconds(cycle)
      setAmountSecondsPassed(elapsed)
      const remaining = Math.max(cycle.minutesAmount * 60 - elapsed, 0)
      document.title = `⏸ ${formatClock(remaining)} • ${APP_NAME}`
      return
    }

    const totalSeconds = cycle.minutesAmount * 60
    let intervalId: number | undefined
    let finished = false

    function updateCountdown() {
      const elapsed = getElapsedSeconds(cycle)

      if (elapsed >= totalSeconds) {
        finished = true

        let nextCycle: Cycle | undefined

        if (cycle.type === 'focus' && settings.autoStartBreaks) {
          const nextType = getNextBreakType(
            [
              ...cycles.filter((item) => item.id !== cycle.id),
              { ...cycle, finishedDate: new Date() },
            ],
            settings.cyclesUntilLongBreak,
          )
          const minutesAmount =
            nextType === 'longBreak'
              ? settings.longBreakMinutes
              : settings.shortBreakMinutes

          nextCycle = {
            id: crypto.randomUUID(),
            type: nextType,
            task: cycle.task,
            taskId: cycle.taskId,
            minutesAmount,
            startDate: new Date(),
            pausedMs: 0,
          }
        }

        dispatch(finishCycleAction(nextCycle))
        setAmountSecondsPassed(totalSeconds)

        if (settings.soundEnabled) {
          playFinishSound()
        }

        if (settings.notificationsEnabled) {
          notifyCycleFinished(cycle.task, cycle.type)
        }

        if (intervalId) {
          window.clearInterval(intervalId)
        }

        return
      }

      setAmountSecondsPassed(elapsed)
      const remaining = Math.max(totalSeconds - elapsed, 0)
      const label = cycle.task || APP_NAME
      document.title = `${formatClock(remaining)} • ${label}`
    }

    updateCountdown()

    if (!finished) {
      intervalId = window.setInterval(updateCountdown, 250)
    }

    return () => {
      if (intervalId) {
        window.clearInterval(intervalId)
      }
    }
  }, [hydrated, activeCycle, cycles, settings])

  const startFocus = useCallback(() => {
    if (!selectedTask) {
      return
    }

    const newCycle: Cycle = {
      id: crypto.randomUUID(),
      type: 'focus',
      task: selectedTask.title,
      taskId: selectedTask.id,
      minutesAmount: settings.focusMinutes,
      startDate: new Date(),
      pausedMs: 0,
    }

    dispatch(addNewCycleAction(newCycle))
    setAmountSecondsPassed(0)
    unlockAudio()

    if (settings.notificationsEnabled) {
      requestNotificationPermission()
    }
  }, [selectedTask, settings.focusMinutes, settings.notificationsEnabled])

  const startFocusForTask = useCallback((taskId: string): StartFocusResult => {
    if (startFocusLockRef.current) {
      const activeId = stateRef.current.activeCycleId
      if (activeId) {
        return { status: 'active_cycle_exists', cycleId: activeId }
      }
      return { status: 'start_in_progress' }
    }

    const current = stateRef.current
    const task = current.tasks.find((item) => item.id === taskId)

    if (!task) {
      return { status: 'task_not_found' }
    }

    if (task.status === 'done' || task.status === 'archived') {
      return { status: 'task_not_eligible' }
    }

    const running = current.cycles.find(
      (cycle) =>
        cycle.id === current.activeCycleId &&
        !cycle.finishedDate &&
        !cycle.interruptedDate,
    )

    if (running) {
      return { status: 'active_cycle_exists', cycleId: running.id }
    }

    startFocusLockRef.current = true
    const cycleId = crypto.randomUUID()
    const newCycle: Cycle = {
      id: cycleId,
      type: 'focus',
      task: task.title,
      taskId: task.id,
      minutesAmount: current.settings.focusMinutes,
      startDate: new Date(),
      pausedMs: 0,
    }

    const selected = pomodoroReducer(current, selectTaskAction(task.id))
    stateRef.current = pomodoroReducer(selected, addNewCycleAction(newCycle))

    dispatch(selectTaskAction(task.id))
    dispatch(addNewCycleAction(newCycle))
    setAmountSecondsPassed(0)
    unlockAudio()

    if (current.settings.notificationsEnabled) {
      requestNotificationPermission()
    }

    startFocusLockRef.current = false
    return { status: 'started', cycleId }
  }, [])

  const pauseCurrentCycle = useCallback(() => {
    dispatch(pauseCurrentCycleAction())
  }, [])

  const resumeCurrentCycle = useCallback(() => {
    dispatch(resumeCurrentCycleAction())
  }, [])

  const interruptCurrentCycle = useCallback(() => {
    dispatch(interruptCurrentCycleAction())
    setAmountSecondsPassed(0)
  }, [])

  const skipCurrentCycle = useCallback(() => {
    dispatch(interruptCurrentCycleAction())
    setAmountSecondsPassed(0)
  }, [])

  const clearHistory = useCallback(() => {
    dispatch(clearHistoryAction())
  }, [])

  const addTask = useCallback((name: string) => {
    const trimmed = name.trim()

    if (!trimmed) {
      return
    }

    dispatch(
      addTaskAction({
        id: crypto.randomUUID(),
        title: trimmed,
        now: nowIso(),
        status: 'active',
      }),
    )
  }, [])

  const captureInboxTask = useCallback((title: string) => {
    const trimmed = title.trim()

    if (!trimmed) {
      return false
    }

    dispatch(
      addTaskAction({
        id: crypto.randomUUID(),
        title: trimmed,
        now: nowIso(),
        status: 'inbox',
      }),
    )

    return true
  }, [])

  const selectTask = useCallback((taskId: string) => {
    dispatch(selectTaskAction(taskId))
  }, [])

  const deleteTask = useCallback((taskId: string) => {
    dispatch(deleteTaskAction(taskId, nowIso()))
  }, [])

  const completeTask = useCallback((taskId: string) => {
    dispatch(completeTaskAction(taskId, nowIso()))
  }, [])

  const reopenTask = useCallback(
    (taskId: string, destination: 'active' | 'inbox' = 'active') => {
      dispatch(reopenTaskAction(taskId, nowIso(), destination))
    },
    [],
  )

  const archiveTask = useCallback((taskId: string) => {
    const dateKey = currentDateKey()

    if (!dateKey) {
      return
    }

    dispatch(archiveTaskAction(taskId, nowIso(), dateKey))
  }, [])

  const updateTaskTitle = useCallback((taskId: string, title: string) => {
    dispatch(updateTaskTitleAction(taskId, title, nowIso()))
  }, [])

  const updateTaskNextAction = useCallback(
    (taskId: string, nextAction: string | null) => {
      dispatch(updateTaskNextActionAction(taskId, nextAction, nowIso()))
    },
    [],
  )

  const updateTaskEnergy = useCallback(
    (taskId: string, energy: TaskEnergy | null) => {
      dispatch(updateTaskEnergyAction(taskId, energy, nowIso()))
    },
    [],
  )

  const updateTaskEstimatedMinutes = useCallback(
    (taskId: string, estimatedMinutes: number | null) => {
      dispatch(
        updateTaskEstimatedMinutesAction(taskId, estimatedMinutes, nowIso()),
      )
    },
    [],
  )

  const applyUnlockPlan = useCallback(
    (input: {
      taskId: string
      nextAction: string
      estimatedMinutes: number
      energy: TaskEnergy
    }): ApplyUnlockPlanOutcome => {
      const now = nowIso()
      const result = applyUnlockPlanToTask(stateRef.current.tasks, {
        ...input,
        now,
      })

      dispatch(
        applyUnlockPlanToTaskAction({
          ...input,
          now,
        }),
      )

      if (result.status === 'applied') {
        return { status: 'applied', taskId: result.task.id }
      }

      return { status: result.status }
    },
    [],
  )

  const moveTaskToActive = useCallback((taskId: string) => {
    dispatch(moveTaskToActiveAction(taskId, nowIso()))
  }, [])

  const setDailyPlanEssential = useCallback(
    (dateKey: string, taskId: string | null) => {
      dispatch(setDailyPlanEssentialAction(dateKey, taskId, nowIso()))
    },
    [],
  )

  const addDailyPlanSecondary = useCallback(
    (dateKey: string, taskId: string) => {
      dispatch(addDailyPlanSecondaryAction(dateKey, taskId, nowIso()))
    },
    [],
  )

  const removeDailyPlanSecondary = useCallback(
    (dateKey: string, taskId: string) => {
      dispatch(removeDailyPlanSecondaryAction(dateKey, taskId, nowIso()))
    },
    [],
  )

  const updateSettings = useCallback((next: Partial<Settings>) => {
    if (next.notificationsEnabled) {
      requestNotificationPermission()
    }

    dispatch(updateSettingsAction(next))
  }, [])

  const value = useMemo(
    () => ({
      hydrated,
      cycles,
      activeCycle,
      activeCycleId,
      amountSecondsPassed,
      tasks,
      selectedTaskId,
      dailyPlans,
      settings,
      startFocus,
      startFocusForTask,
      pauseCurrentCycle,
      resumeCurrentCycle,
      interruptCurrentCycle,
      skipCurrentCycle,
      clearHistory,
      addTask,
      captureInboxTask,
      selectTask,
      deleteTask,
      completeTask,
      reopenTask,
      archiveTask,
      updateTaskTitle,
      updateTaskNextAction,
      updateTaskEnergy,
      updateTaskEstimatedMinutes,
      applyUnlockPlan,
      moveTaskToActive,
      setDailyPlanEssential,
      addDailyPlanSecondary,
      removeDailyPlanSecondary,
      updateSettings,
    }),
    [
      hydrated,
      cycles,
      activeCycle,
      activeCycleId,
      amountSecondsPassed,
      tasks,
      selectedTaskId,
      dailyPlans,
      settings,
      startFocus,
      startFocusForTask,
      pauseCurrentCycle,
      resumeCurrentCycle,
      interruptCurrentCycle,
      skipCurrentCycle,
      clearHistory,
      addTask,
      captureInboxTask,
      selectTask,
      deleteTask,
      completeTask,
      reopenTask,
      archiveTask,
      updateTaskTitle,
      updateTaskNextAction,
      updateTaskEnergy,
      updateTaskEstimatedMinutes,
      applyUnlockPlan,
      moveTaskToActive,
      setDailyPlanEssential,
      addDailyPlanSecondary,
      removeDailyPlanSecondary,
      updateSettings,
    ],
  )

  return (
    <PomodoroContext.Provider value={value}>
      {children}
    </PomodoroContext.Provider>
  )
}

export function usePomodoro() {
  return useContext(PomodoroContext)
}
