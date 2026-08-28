'use client'

import { useState } from 'react'
import {
  canTaskEnterPlan,
  getDailyPlanByDate,
  tasksByStatus,
  type Task,
} from '@destravai/core'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { usePomodoro } from '../../contexts/PomodoroContext'
import { ConfirmDialog } from './ConfirmDialog'
import { useStartFocusForTask } from './useStartFocusForTask'

const PREVIEW_LIMIT = 3

interface InboxPreviewProps {
  dateKey: string
  onEdit: (task: Task) => void
}

export function InboxPreview({ dateKey, onEdit }: InboxPreviewProps) {
  const {
    tasks,
    dailyPlans,
    moveTaskToActive,
    setDailyPlanEssential,
    addDailyPlanSecondary,
    archiveTask,
  } = usePomodoro()
  const startFocusForTask = useStartFocusForTask()
  const [expanded, setExpanded] = useState(false)
  const [archiveTaskItem, setArchiveTaskItem] = useState<Task | null>(null)
  const inbox = tasksByStatus(tasks, 'inbox')
  const plan = getDailyPlanByDate(dailyPlans, dateKey)
  const essentialOpen = !plan?.essentialTaskId
  const secondarySlots = Math.max(0, 2 - (plan?.secondaryTaskIds.length ?? 0))
  const visible = expanded ? inbox : inbox.slice(0, PREVIEW_LIMIT)

  function addAsEssential(task: Task) {
    if (!canTaskEnterPlan(task) || !essentialOpen) {
      return
    }

    moveTaskToActive(task.id)
    setDailyPlanEssential(dateKey, task.id)
  }

  function addAsSecondary(task: Task) {
    if (!canTaskEnterPlan(task) || secondarySlots <= 0) {
      return
    }

    moveTaskToActive(task.id)
    addDailyPlanSecondary(dateKey, task.id)
  }

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-ink dark:text-ink-dark">
          Caixa de entrada
        </h2>
        <p className="mt-1 text-sm text-muted dark:text-muted-dark">
          {inbox.length === 0
            ? 'Nada por aqui. Capture o que estiver na cabeça.'
            : `${inbox.length} ${
                inbox.length === 1 ? 'item' : 'itens'
              } para organizar quando fizer sentido.`}
        </p>
      </div>

      {inbox.length === 0 ? null : (
        <ul className="space-y-3">
          {visible.map((task) => (
            <li
              key={task.id}
              className="rounded-xl border border-line px-3 py-3 dark:border-line-dark"
            >
              <p className="font-medium text-ink dark:text-ink-dark">
                {task.title}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {essentialOpen && (
                  <Button
                    variant="secondary"
                    className="h-11"
                    onClick={() => addAsEssential(task)}
                  >
                    Tornar essencial
                  </Button>
                )}
                {secondarySlots > 0 && (
                  <Button
                    variant="secondary"
                    className="h-11"
                    onClick={() => addAsSecondary(task)}
                  >
                    Adicionar como secundária
                  </Button>
                )}
                <Button
                  variant="ghost"
                  className="h-11"
                  onClick={() => moveTaskToActive(task.id)}
                >
                  Mover para ativas
                </Button>
                <Button
                  variant="ghost"
                  className="h-11"
                  onClick={() => startFocusForTask(task.id)}
                >
                  Iniciar foco
                </Button>
                <Button
                  variant="ghost"
                  className="h-11"
                  onClick={() => onEdit(task)}
                >
                  Editar
                </Button>
                <Button
                  variant="ghost"
                  className="h-11 text-danger hover:bg-danger/10"
                  onClick={() => setArchiveTaskItem(task)}
                >
                  Arquivar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {inbox.length > PREVIEW_LIMIT && (
        <Button
          variant="secondary"
          className="h-11 w-full"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Mostrar menos' : `Ver todas (${inbox.length})`}
        </Button>
      )}

      <ConfirmDialog
        open={!!archiveTaskItem}
        title="Arquivar tarefa?"
        description={
          archiveTaskItem
            ? `“${archiveTaskItem.title}” sai da caixa de entrada.`
            : ''
        }
        confirmLabel="Arquivar"
        onConfirm={() => {
          if (archiveTaskItem) {
            archiveTask(archiveTaskItem.id)
          }
        }}
        onClose={() => setArchiveTaskItem(null)}
      />
    </Card>
  )
}
