'use client'

import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react'
import {
  addNewCycleAction,
  addTaskAction,
  clearHistoryAction,
  deleteTaskAction,
  finishCycleAction,
  formatClock,
  getElapsedSeconds,
  getNextBreakType,
  hydratePomodoroStateAction,
  interruptCurrentCycleAction,
  pauseCurrentCycleAction,
  pomodoroReducer,
  resumeCurrentCycleAction,
  selectTaskAction,
  updateSettingsAction,
  type Cycle,
  type Settings,
  type Task,
  initialPomodoroState,
} from '@destravai/core'
import {
  applyThemeClass,
  loadPomodoroState,
  persistPomodoroState,
} from '../lib/storage'
import { APP_NAME } from '../lib/brand'
import {
  notifyCycleFinished,
  playFinishSound,
  requestNotificationPermission,
  unlockAudio,
} from '../utils/cycleAlerts'

interface PomodoroContextType {
  cycles: Cycle[]
  activeCycle: Cycle | undefined
  activeCycleId: string | null
  amountSecondsPassed: number
  tasks: Task[]
  selectedTaskId: string | null
  settings: Settings
  startFocus: () => void
  pauseCurrentCycle: () => void
  resumeCurrentCycle: () => void
  interruptCurrentCycle: () => void
  skipCurrentCycle: () => void
  clearHistory: () => void
  addTask: (name: string) => void
  selectTask: (taskId: string) => void
  deleteTask: (taskId: string) => void
  updateSettings: (settings: Partial<Settings>) => void
}

export const PomodoroContext = createContext({} as PomodoroContextType)

interface PomodoroProviderProps {
  children: ReactNode
}

export function PomodoroProvider({ children }: PomodoroProviderProps) {
  const [state, dispatch] = useReducer(pomodoroReducer, initialPomodoroState)
  const [hydrated, setHydrated] = useState(false)

  const { cycles, activeCycleId, selectedTaskId, tasks, settings } = state
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
        now: new Date().toISOString(),
        status: 'active',
      }),
    )
  }, [])

  const selectTask = useCallback((taskId: string) => {
    dispatch(selectTaskAction(taskId))
  }, [])

  const deleteTask = useCallback((taskId: string) => {
    dispatch(deleteTaskAction(taskId, new Date().toISOString()))
  }, [])

  const updateSettings = useCallback((next: Partial<Settings>) => {
    if (next.notificationsEnabled) {
      requestNotificationPermission()
    }

    dispatch(updateSettingsAction(next))
  }, [])

  const value = useMemo(
    () => ({
      cycles,
      activeCycle,
      activeCycleId,
      amountSecondsPassed,
      tasks,
      selectedTaskId,
      settings,
      startFocus,
      pauseCurrentCycle,
      resumeCurrentCycle,
      interruptCurrentCycle,
      skipCurrentCycle,
      clearHistory,
      addTask,
      selectTask,
      deleteTask,
      updateSettings,
    }),
    [
      cycles,
      activeCycle,
      activeCycleId,
      amountSecondsPassed,
      tasks,
      selectedTaskId,
      settings,
      startFocus,
      pauseCurrentCycle,
      resumeCurrentCycle,
      interruptCurrentCycle,
      skipCurrentCycle,
      clearHistory,
      addTask,
      selectTask,
      deleteTask,
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
