'use client'

import { useState } from 'react'
import {
  CheckCircle,
  DotsThree,
  PencilSimple,
  Play,
  Tray,
} from '@phosphor-icons/react'
import type { Task } from '@destravai/core'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { cn } from '../../lib/cn'
import { energyLabel } from '../../lib/energy'
import { usePomodoro } from '../../contexts/PomodoroContext'
import { useStartFocusForTask } from './useStartFocusForTask'
import { ConfirmDialog } from './ConfirmDialog'

interface TaskPlanCardProps {
  task: Task
  dateKey: string
  variant: 'essential' | 'secondary'
  onEdit: (task: Task) => void
  onCompleted?: (title: string) => void
}

export function TaskPlanCard({
  task,
  dateKey,
  variant,
  onEdit,
  onCompleted,
}: TaskPlanCardProps) {
  const {
    completeTask,
    reopenTask,
    archiveTask,
    setDailyPlanEssential,
    removeDailyPlanSecondary,
    activeCycle,
  } = usePomodoro()
  const startFocusForTask = useStartFocusForTask()
  const [menuOpen, setMenuOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const isDone = task.status === 'done'
  const canMutatePlan = !isDone
  const alreadyFocusing = !!activeCycle

  function handleComplete() {
    completeTask(task.id)
    onCompleted?.(task.title)
  }

  function handleRemoveFromPlan() {
    if (isDone) {
      return
    }

    if (variant === 'essential') {
      setDailyPlanEssential(dateKey, null)
      return
    }

    removeDailyPlanSecondary(dateKey, task.id)
  }

  return (
    <Card
      className={cn(
        'space-y-3 motion-reduce:transition-none',
        variant === 'essential' && 'border-brand/40 bg-brand/5',
        isDone && 'border-line/80 dark:border-line-dark/80',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-wide text-muted uppercase dark:text-muted-dark">
            {variant === 'essential' ? 'Essencial' : 'Secundária'}
          </p>
          <h3 className="mt-1 text-lg font-bold text-ink dark:text-ink-dark">
            {task.title}
          </h3>
        </div>
        {isDone && (
          <span className="inline-flex items-center gap-1 rounded-full bg-line px-2 py-1 text-xs font-medium text-ink dark:bg-line-dark dark:text-ink-dark">
            <CheckCircle size={14} aria-hidden />
            Concluída
          </span>
        )}
      </div>

      {task.nextAction && (
        <p className="text-sm text-ink dark:text-ink-dark">
          <span className="text-muted dark:text-muted-dark">
            Próximo passo:{' '}
          </span>
          {task.nextAction}
        </p>
      )}

      <div className="flex flex-wrap gap-2 text-xs text-muted dark:text-muted-dark">
        {energyLabel(task.energy) && (
          <span className="rounded-full bg-line px-2 py-1 dark:bg-line-dark">
            Energia: {energyLabel(task.energy)}
          </span>
        )}
        {task.estimatedMinutes ? (
          <span className="rounded-full bg-line px-2 py-1 dark:bg-line-dark">
            Cerca de {task.estimatedMinutes} min
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {isDone ? (
          <Button
            variant="secondary"
            className="h-11"
            onClick={() => reopenTask(task.id, 'active')}
          >
            Reabrir
          </Button>
        ) : (
          <>
            <Button className="h-11" onClick={() => startFocusForTask(task.id)}>
              <Play size={16} weight="fill" aria-hidden />
              {alreadyFocusing ? 'Voltar ao foco' : 'Iniciar foco'}
            </Button>
            <Button
              variant="secondary"
              className="h-11"
              onClick={handleComplete}
            >
              Concluir
            </Button>
          </>
        )}

        <div className="relative">
          <Button
            variant="ghost"
            className="h-11 w-11 px-0"
            aria-label={`Mais ações para ${task.title}`}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <DotsThree size={20} aria-hidden />
          </Button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 z-10 mt-1 min-w-48 rounded-xl border border-line bg-panel p-1 shadow-lg dark:border-line-dark dark:bg-panel-dark"
            >
              <button
                type="button"
                role="menuitem"
                className="flex h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm hover:bg-line focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none dark:hover:bg-line-dark"
                onClick={() => {
                  setMenuOpen(false)
                  onEdit(task)
                }}
              >
                <PencilSimple size={16} aria-hidden />
                Editar
              </button>
              {canMutatePlan && (
                <button
                  type="button"
                  role="menuitem"
                  className="flex h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm hover:bg-line focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none dark:hover:bg-line-dark"
                  onClick={() => {
                    setMenuOpen(false)
                    handleRemoveFromPlan()
                  }}
                >
                  Remover do plano
                </button>
              )}
              {canMutatePlan && (
                <button
                  type="button"
                  role="menuitem"
                  className="flex h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-danger hover:bg-danger/10 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
                  onClick={() => {
                    setMenuOpen(false)
                    setArchiveOpen(true)
                  }}
                >
                  <Tray size={16} aria-hidden />
                  Arquivar
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={archiveOpen}
        title="Arquivar tarefa?"
        description={`“${task.title}” sai do plano de hoje. Você pode encontrá-la depois no histórico de tarefas, se precisar.`}
        confirmLabel="Arquivar"
        onConfirm={() => archiveTask(task.id)}
        onClose={() => setArchiveOpen(false)}
      />
    </Card>
  )
}

export function EssentialTaskCard(props: Omit<TaskPlanCardProps, 'variant'>) {
  return <TaskPlanCard {...props} variant="essential" />
}

export function SecondaryTaskCard(props: Omit<TaskPlanCardProps, 'variant'>) {
  return <TaskPlanCard {...props} variant="secondary" />
}
