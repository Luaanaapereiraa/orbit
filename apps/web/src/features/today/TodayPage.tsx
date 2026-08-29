'use client'

import { useState } from 'react'
import type { Task } from '@destravai/core'
import { Card } from '../../components/ui/Card'
import { usePomodoro } from '../../contexts/PomodoroContext'
import { formatPtBrDate, useLocalDateKey } from '../../lib/local-date'
import { ActiveFocusCard } from './ActiveFocusCard'
import { DailyPlanView } from './DailyPlanView'
import { InboxPreview } from './InboxPreview'
import { QuickCapture } from './QuickCapture'
import { UnlockTaskDialog } from '../unlock-task/UnlockTaskDialog'
import { TaskEditor } from './TaskEditor'

export function TodayPage() {
  const { hydrated } = usePomodoro()
  const dateKey = useLocalDateKey(hydrated)
  const [editing, setEditing] = useState<Task | null>(null)
  const [unlocking, setUnlocking] = useState<Task | null>(null)
  const [completionMessage, setCompletionMessage] = useState('')

  if (!hydrated || !dateKey) {
    return (
      <div className="space-y-6" aria-busy="true" aria-live="polite">
        <Card className="space-y-3">
          <div className="h-7 w-24 rounded-lg bg-line motion-reduce:transition-none dark:bg-line-dark" />
          <div className="h-4 w-48 rounded-lg bg-line motion-reduce:transition-none dark:bg-line-dark" />
          <p className="text-sm text-muted dark:text-muted-dark">
            Preparando o seu dia…
          </p>
        </Card>
        <Card className="h-32 bg-line/40 dark:bg-line-dark/40" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-ink dark:text-ink-dark">Hoje</h1>
        <p className="text-sm capitalize text-muted dark:text-muted-dark">
          {formatPtBrDate(dateKey)}
        </p>
        <p className="text-sm text-muted dark:text-muted-dark">
          Vamos escolher o que merece sua atenção agora.
        </p>
      </header>

      <QuickCapture />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <DailyPlanView
          dateKey={dateKey}
          onEdit={setEditing}
          onUnlock={setUnlocking}
          onCompleted={(title) =>
            setCompletionMessage(
              `Concluída: ${title}. Ela permanece no seu plano de hoje.`,
            )
          }
        />
        <div className="space-y-6">
          <InboxPreview
            dateKey={dateKey}
            onEdit={setEditing}
            onUnlock={setUnlocking}
          />
          <ActiveFocusCard />
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {completionMessage}
      </p>

      <TaskEditor task={editing} onClose={() => setEditing(null)} />
      <UnlockTaskDialog task={unlocking} onClose={() => setUnlocking(null)} />
    </div>
  )
}
