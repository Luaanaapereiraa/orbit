'use client'

import { useState } from 'react'
import { HandPalm, Pause, Play, SkipForward } from '@phosphor-icons/react'
import { formatClock, type CycleType, type Task } from '@destravai/core'
import { usePomodoro } from '../../contexts/PomodoroContext'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ProgressRing } from './ProgressRing'
import { UnlockTaskDialog } from '../unlock-task/UnlockTaskDialog'
import { TaskPanel } from './TaskPanel'

const typeLabels: Record<CycleType, string> = {
  focus: 'Foco',
  shortBreak: 'Pausa curta',
  longBreak: 'Pausa longa',
}

export function Home() {
  const {
    activeCycle,
    amountSecondsPassed,
    selectedTaskId,
    tasks,
    settings,
    cycles,
    startFocus,
    pauseCurrentCycle,
    resumeCurrentCycle,
    interruptCurrentCycle,
    skipCurrentCycle,
  } = usePomodoro()
  const [unlocking, setUnlocking] = useState<Task | null>(null)

  const selectedTask = tasks.find((task) => task.id === selectedTaskId)
  const type = activeCycle?.type ?? 'focus'
  const totalSeconds = activeCycle
    ? activeCycle.minutesAmount * 60
    : settings.focusMinutes * 60
  const remaining = Math.max(totalSeconds - amountSecondsPassed, 0)
  const progress = totalSeconds > 0 ? amountSecondsPassed / totalSeconds : 0
  const isPaused = !!activeCycle?.pausedAt
  const isBreak = !!activeCycle && activeCycle.type !== 'focus'
  const completedFocus = cycles.filter(
    (cycle) => cycle.type === 'focus' && cycle.finishedDate,
  ).length
  const untilLong = settings.cyclesUntilLongBreak
  const focusInSet =
    untilLong > 0
      ? (completedFocus % untilLong) + (activeCycle?.type === 'focus' ? 1 : 0)
      : 0

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <Card className="flex flex-col items-center justify-center gap-6 py-10">
        <span className="rounded-full bg-line px-3 py-1 text-xs font-bold tracking-wide uppercase dark:bg-line-dark">
          {typeLabels[type]}
        </span>

        <ProgressRing
          progress={activeCycle ? progress : 0}
          timeLabel={formatClock(remaining)}
          caption={
            activeCycle?.task ||
            selectedTask?.title ||
            'Selecione uma tarefa para começar'
          }
          type={type}
          paused={isPaused}
        />

        <p className="text-sm text-muted dark:text-muted-dark">
          {untilLong > 0
            ? `${Math.min(
                focusInSet,
                untilLong,
              )} / ${untilLong} ciclos até a pausa longa`
            : 'Pausa longa desativada'}
        </p>

        <div className="flex w-full max-w-md flex-wrap justify-center gap-3">
          {!activeCycle && (
            <Button
              className="min-w-40 flex-1"
              disabled={!selectedTask}
              onClick={startFocus}
            >
              <Play size={20} weight="fill" />
              Começar
            </Button>
          )}

          {activeCycle && !isPaused && (
            <Button className="min-w-40 flex-1" onClick={pauseCurrentCycle}>
              <Pause size={20} weight="fill" />
              Pausar
            </Button>
          )}

          {activeCycle && isPaused && (
            <Button className="min-w-40 flex-1" onClick={resumeCurrentCycle}>
              <Play size={20} weight="fill" />
              Retomar
            </Button>
          )}

          {activeCycle && (
            <Button
              variant="danger"
              className="min-w-40 flex-1"
              onClick={interruptCurrentCycle}
            >
              <HandPalm size={20} />
              Interromper
            </Button>
          )}

          {isBreak && (
            <Button
              variant="secondary"
              className="min-w-40 flex-1"
              onClick={skipCurrentCycle}
            >
              <SkipForward size={20} />
              Pular
            </Button>
          )}
        </div>
      </Card>

      <TaskPanel onUnlock={setUnlocking} />
      <UnlockTaskDialog task={unlocking} onClose={() => setUnlocking(null)} />
    </div>
  )
}
