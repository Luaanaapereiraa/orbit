'use client'

import { useEffect, useRef, useState } from 'react'
import {
  canTaskEnterPlan,
  getDailyPlanByDate,
  type Task,
} from '@destravai/core'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { usePomodoro } from '../../contexts/PomodoroContext'
import { diffPlanDraft, draftFromPlan, type PlanDraft } from './plan-draft'

interface PlanDayDialogProps {
  open: boolean
  dateKey: string
  onClose: () => void
}

function availableCandidates(tasks: Task[], draft: PlanDraft) {
  return tasks.filter((task) => {
    if (!canTaskEnterPlan(task)) {
      return false
    }

    return (
      draft.essentialTaskId !== task.id &&
      !draft.secondaryTaskIds.includes(task.id)
    )
  })
}

export function PlanDayDialog({ open, dateKey, onClose }: PlanDayDialogProps) {
  const {
    tasks,
    dailyPlans,
    moveTaskToActive,
    setDailyPlanEssential,
    addDailyPlanSecondary,
    removeDailyPlanSecondary,
  } = usePomodoro()
  const currentPlan = getDailyPlanByDate(dailyPlans, dateKey)
  const [draft, setDraft] = useState<PlanDraft>(() =>
    draftFromPlan(currentPlan),
  )
  const wasOpenRef = useRef(false)

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setDraft(draftFromPlan(getDailyPlanByDate(dailyPlans, dateKey)))
    }

    wasOpenRef.current = open
  }, [dailyPlans, dateKey, open])

  const essentialTask = tasks.find((task) => task.id === draft.essentialTaskId)
  const essentialLocked = essentialTask?.status === 'done'
  const secondaries = draft.secondaryTaskIds
    .map((id) => tasks.find((task) => task.id === id))
    .filter((task): task is Task => !!task)
  const candidates = availableCandidates(tasks, draft)
  const secondarySlotsLeft = Math.max(0, 2 - draft.secondaryTaskIds.length)

  function setEssential(taskId: string | null) {
    if (essentialLocked) {
      return
    }

    setDraft((current) => ({
      essentialTaskId: taskId,
      secondaryTaskIds: current.secondaryTaskIds.filter((id) => id !== taskId),
    }))
  }

  function toggleSecondary(taskId: string) {
    setDraft((current) => {
      if (current.essentialTaskId === taskId) {
        return current
      }

      if (current.secondaryTaskIds.includes(taskId)) {
        const task = tasks.find((item) => item.id === taskId)

        if (task?.status === 'done') {
          return current
        }

        return {
          ...current,
          secondaryTaskIds: current.secondaryTaskIds.filter(
            (id) => id !== taskId,
          ),
        }
      }

      if (current.secondaryTaskIds.length >= 2) {
        return current
      }

      const task = tasks.find((item) => item.id === taskId)

      if (!canTaskEnterPlan(task)) {
        return current
      }

      return {
        ...current,
        secondaryTaskIds: [...current.secondaryTaskIds, taskId],
      }
    })
  }

  function handleConfirm() {
    const ops = diffPlanDraft(currentPlan, draft, tasks)

    for (const op of ops) {
      if (op.type === 'move-active') {
        moveTaskToActive(op.taskId)
      }

      if (op.type === 'set-essential') {
        setDailyPlanEssential(dateKey, op.taskId)
      }

      if (op.type === 'remove-secondary') {
        removeDailyPlanSecondary(dateKey, op.taskId)
      }

      if (op.type === 'add-secondary') {
        addDailyPlanSecondary(dateKey, op.taskId)
      }
    }

    onClose()
  }

  return (
    <Dialog open={open} title="Planejar meu dia" onClose={onClose}>
      <div className="space-y-5">
        <p className="text-sm text-muted dark:text-muted-dark">
          Escolha uma essencial e, se quiser, até duas secundárias. Tarefas da
          caixa de entrada entram no plano sem serem copiadas.
        </p>

        <section>
          <h3 className="text-sm font-bold text-ink dark:text-ink-dark">
            Essencial
          </h3>
          {essentialLocked && essentialTask && (
            <p className="mt-2 text-sm text-muted dark:text-muted-dark">
              “{essentialTask.title}” está concluída e permanece no plano.
            </p>
          )}
          <ul className="mt-2 space-y-2">
            {essentialTask && (
              <li>
                <label className="flex min-h-11 items-center gap-2 rounded-xl border border-brand/30 bg-brand/5 px-3 text-sm">
                  <input
                    type="radio"
                    name="plan-essential"
                    checked
                    disabled={essentialLocked}
                    onChange={() => setEssential(essentialTask.id)}
                  />
                  {essentialTask.title}
                </label>
              </li>
            )}
            {!essentialLocked && (
              <li>
                <label className="flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 text-sm dark:border-line-dark">
                  <input
                    type="radio"
                    name="plan-essential"
                    checked={!essentialTask}
                    onChange={() => setEssential(null)}
                  />
                  Sem essencial por agora
                </label>
              </li>
            )}
            {!essentialLocked &&
              candidates.map((task) => (
                <li key={`essential-${task.id}`}>
                  <label className="flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 text-sm dark:border-line-dark">
                    <input
                      type="radio"
                      name="plan-essential"
                      checked={false}
                      onChange={() => setEssential(task.id)}
                    />
                    {task.title}
                    <StatusHint task={task} />
                  </label>
                </li>
              ))}
          </ul>
        </section>

        <section>
          <h3 className="text-sm font-bold text-ink dark:text-ink-dark">
            Secundárias
          </h3>
          <p className="mt-1 text-xs text-muted dark:text-muted-dark">
            {secondarySlotsLeft === 0
              ? 'As duas vagas já estão preenchidas.'
              : `Você ainda pode escolher ${secondarySlotsLeft}.`}
          </p>
          <ul className="mt-2 space-y-2">
            {secondaries.map((task) => (
              <li key={`sec-${task.id}`}>
                <label className="flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 text-sm dark:border-line-dark">
                  <input
                    type="checkbox"
                    checked
                    disabled={task.status === 'done'}
                    onChange={() => toggleSecondary(task.id)}
                  />
                  {task.title}
                  {task.status === 'done' ? ' (concluída)' : null}
                </label>
              </li>
            ))}
            {secondarySlotsLeft > 0 &&
              candidates.map((task) => (
                <li key={`add-sec-${task.id}`}>
                  <label className="flex min-h-11 items-center gap-2 rounded-xl border border-dashed border-line px-3 text-sm dark:border-line-dark">
                    <input
                      type="checkbox"
                      checked={false}
                      onChange={() => toggleSecondary(task.id)}
                    />
                    {task.title}
                    <StatusHint task={task} />
                  </label>
                </li>
              ))}
          </ul>
        </section>

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleConfirm}>
            Confirmar plano
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

function StatusHint({ task }: { task: Task }) {
  if (task.status === 'inbox') {
    return (
      <span className="text-xs text-muted dark:text-muted-dark">
        · caixa de entrada
      </span>
    )
  }

  return null
}
