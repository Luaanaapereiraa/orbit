'use client'

import Link from 'next/link'
import { formatClock, type CycleType } from '@destravai/core'
import { usePomodoro } from '../../contexts/PomodoroContext'
import { Card } from '../../components/ui/Card'

const typeLabels: Record<CycleType, string> = {
  focus: 'Foco',
  shortBreak: 'Pausa curta',
  longBreak: 'Pausa longa',
}

export function ActiveFocusCard() {
  const { activeCycle, amountSecondsPassed } = usePomodoro()

  if (!activeCycle) {
    return null
  }

  const remaining = Math.max(
    activeCycle.minutesAmount * 60 - amountSecondsPassed,
    0,
  )
  const paused = !!activeCycle.pausedAt

  return (
    <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-xs font-bold tracking-wide text-muted uppercase dark:text-muted-dark">
          {typeLabels[activeCycle.type]}
          {paused ? ' · Pausado' : ' · Em andamento'}
        </p>
        <p className="mt-1 font-medium text-ink dark:text-ink-dark">
          {activeCycle.task || 'Ciclo em andamento'}
        </p>
        <p className="mt-1 font-mono text-lg text-ink dark:text-ink-dark">
          {formatClock(remaining)} restantes
        </p>
      </div>
      <Link
        href="/focus"
        className="inline-flex h-11 min-w-44 items-center justify-center rounded-xl bg-brand px-5 text-sm font-bold text-white transition hover:bg-brand-strong focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
      >
        Voltar ao foco
      </Link>
    </Card>
  )
}
