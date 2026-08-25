/* eslint-disable react-refresh/only-export-components */
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
import { differenceInSeconds } from 'date-fns'
import {
  addNewCycleAction,
  clearHistoryAction,
  interruptCurrentCycleAction,
  markCurrentCycleAsFinishedAction,
} from '../reducers/cycles/actions'
import { Cycle, CyclesState, cyclesReducer } from '../reducers/cycles/reducer'
import {
  notifyCycleFinished,
  playFinishSound,
  requestNotificationPermission,
  unlockAudio,
} from '../utils/cycleAlerts'

const STORAGE_KEY = '@pomodorodev:cycles-state-1.0.0'

interface CreateCycleData {
  task: string
  minutesAmount: number
}

interface CyclesContextType {
  cycles: Cycle[]
  activeCycle: Cycle | undefined
  activeCycleId: string | null
  amountSecondsPassed: number
  createNewCycle: (data: CreateCycleData) => void
  interruptCurrentCycle: () => void
  clearHistory: () => void
}

export const CyclesContext = createContext({} as CyclesContextType)

interface CyclesContextProviderProps {
  children: ReactNode
}

function getStoredCyclesState(): CyclesState {
  const storedStateAsJSON = localStorage.getItem(STORAGE_KEY)

  if (storedStateAsJSON) {
    try {
      return JSON.parse(storedStateAsJSON) as CyclesState
    } catch {
      return { cycles: [], activeCycleId: null }
    }
  }

  return { cycles: [], activeCycleId: null }
}

export function CyclesContextProvider({
  children,
}: CyclesContextProviderProps) {
  const [cyclesState, dispatch] = useReducer(
    cyclesReducer,
    {
      cycles: [],
      activeCycleId: null,
    },
    getStoredCyclesState,
  )

  const { cycles, activeCycleId } = cyclesState
  const activeCycle = cycles.find((cycle) => cycle.id === activeCycleId)

  const [amountSecondsPassed, setAmountSecondsPassed] = useState(() => {
    if (activeCycle) {
      return differenceInSeconds(new Date(), new Date(activeCycle.startDate))
    }

    return 0
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cyclesState))
  }, [cyclesState])

  useEffect(() => {
    const cycle = activeCycle

    if (!cycle) {
      document.title = 'Pomodoro Dev'
      return
    }

    const cycleStartDate = new Date(cycle.startDate)
    const cycleTask = cycle.task
    const totalSeconds = cycle.minutesAmount * 60
    let intervalId: number | undefined
    let finished = false

    function updateCountdown() {
      const secondsDifference = differenceInSeconds(new Date(), cycleStartDate)

      if (secondsDifference >= totalSeconds) {
        finished = true
        dispatch(markCurrentCycleAsFinishedAction())
        setAmountSecondsPassed(totalSeconds)
        playFinishSound()
        notifyCycleFinished(cycleTask)
        document.title = 'Pomodoro Dev'
        if (intervalId) {
          window.clearInterval(intervalId)
        }
        return
      }

      setAmountSecondsPassed(secondsDifference)

      const currentSeconds = totalSeconds - secondsDifference
      const minutes = String(Math.floor(currentSeconds / 60)).padStart(2, '0')
      const seconds = String(currentSeconds % 60).padStart(2, '0')
      document.title = `${minutes}:${seconds} • ${cycleTask}`
    }

    updateCountdown()

    if (!finished) {
      intervalId = window.setInterval(updateCountdown, 1000)
    }

    return () => {
      if (intervalId) {
        window.clearInterval(intervalId)
      }
    }
  }, [activeCycle])

  const createNewCycle = useCallback((data: CreateCycleData) => {
    const newCycle: Cycle = {
      id: crypto.randomUUID(),
      task: data.task,
      minutesAmount: data.minutesAmount,
      startDate: new Date(),
    }

    dispatch(addNewCycleAction(newCycle))
    setAmountSecondsPassed(0)
    unlockAudio()
    requestNotificationPermission()
  }, [])

  const interruptCurrentCycle = useCallback(() => {
    dispatch(interruptCurrentCycleAction())
    setAmountSecondsPassed(0)
  }, [])

  const clearHistory = useCallback(() => {
    dispatch(clearHistoryAction())
  }, [])

  const value = useMemo(
    () => ({
      cycles,
      activeCycle,
      activeCycleId,
      amountSecondsPassed,
      createNewCycle,
      interruptCurrentCycle,
      clearHistory,
    }),
    [
      cycles,
      activeCycle,
      activeCycleId,
      amountSecondsPassed,
      createNewCycle,
      interruptCurrentCycle,
      clearHistory,
    ],
  )

  return (
    <CyclesContext.Provider value={value}>{children}</CyclesContext.Provider>
  )
}

export function useCycles() {
  return useContext(CyclesContext)
}
