'use client'

import { type FormEvent, useEffect, useMemo, useState } from 'react'
import type {
  BlockageReason,
  UnlockPlan,
  UnlockTaskRunResponse,
} from '@destravai/contracts'
import {
  BLOCKAGE_DETAILS_MAX_LENGTH,
  MAX_AVAILABLE_MINUTES,
  MIN_AVAILABLE_MINUTES,
} from '@destravai/contracts'
import type { Task, TaskEnergy } from '@destravai/core'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { useAuth } from '../../contexts/AuthContext'
import { usePomodoro } from '../../contexts/PomodoroContext'
import { SignInForm } from '../auth/SignInForm'
import { ConfirmDialog } from '../today/ConfirmDialog'
import { useStartFocusForTask } from '../today/useStartFocusForTask'
import { ENERGY_OPTIONS, energyLabel } from '../../lib/energy'
import { toLocalDateKey, useLocalDateKey } from '../../lib/local-date'
import {
  applyUnlockPlanToTask,
  unlockPlanTaskPatch,
} from '../../lib/unlock-task/apply'
import {
  messageForUnlockError,
  requestUnlockTaskRun,
  UnlockTaskApiError,
} from '../../lib/unlock-task/client'
import {
  BLOCKAGE_OPTIONS,
  buildUnlockTaskRequest,
  canRequestUnlock,
  clampAvailableMinutes,
  plannedTaskCountForDate,
  todayRoleForTask,
} from '../../lib/unlock-task/request'

interface UnlockTaskDialogProps {
  task: Task | null
  onClose: () => void
  requestUnlock?: typeof requestUnlockTaskRun
}

type Step =
  | 'auth'
  | 'form'
  | 'loading'
  | 'completed'
  | 'clarification'
  | 'rejected'
  | 'error'

export function UnlockTaskDialog({
  task,
  onClose,
  requestUnlock = requestUnlockTaskRun,
}: UnlockTaskDialogProps) {
  const { status, session } = useAuth()
  const {
    hydrated,
    dailyPlans,
    tasks,
    settings,
    updateTaskNextAction,
    updateTaskEnergy,
    updateTaskEstimatedMinutes,
  } = usePomodoro()
  const observedDateKey = useLocalDateKey(hydrated)
  const dateKey = observedDateKey ?? (hydrated ? toLocalDateKey() : null)
  const startFocusForTask = useStartFocusForTask()
  const liveTask = tasks.find((item) => item.id === task?.id) ?? task

  const [step, setStep] = useState<Step>('form')
  const [reason, setReason] = useState<BlockageReason>(
    'dont_know_where_to_start',
  )
  const [details, setDetails] = useState('')
  const [energy, setEnergy] = useState<TaskEnergy | ''>('')
  const [availableMinutes, setAvailableMinutes] = useState(25)
  const [clientRequestId, setClientRequestId] = useState('')
  const [result, setResult] = useState<UnlockTaskRunResponse | null>(null)
  const [error, setError] = useState('')
  const [applied, setApplied] = useState(false)
  const [applyOpen, setApplyOpen] = useState(false)

  useEffect(() => {
    if (!task) {
      return
    }

    setReason('dont_know_where_to_start')
    setDetails('')
    setEnergy(task.energy ?? '')
    setAvailableMinutes(
      clampAvailableMinutes(task.estimatedMinutes ?? settings.focusMinutes),
    )
    setClientRequestId(crypto.randomUUID())
    setResult(null)
    setError('')
    setApplied(false)
    setApplyOpen(false)
    setStep(status === 'signed-in' && session ? 'form' : 'auth')
  }, [session, settings.focusMinutes, status, task])

  const plan = result?.status === 'completed' ? result.plan : null
  const patch = useMemo(() => (plan ? unlockPlanTaskPatch(plan) : null), [plan])

  async function submit(event?: FormEvent) {
    event?.preventDefault()
    if (!liveTask || !dateKey || !session || !canRequestUnlock(liveTask)) {
      return
    }

    if (reason === 'other' && !details.trim()) {
      setError('Descreva o motivo para eu entender o bloqueio.')
      setStep('form')
      return
    }

    const requestId = clientRequestId || crypto.randomUUID()
    setClientRequestId(requestId)
    setError('')
    setStep('loading')

    try {
      const body = buildUnlockTaskRequest({
        clientRequestId: requestId,
        task: liveTask,
        blockageReason: reason,
        blockageDetails: details.trim() ? details.trim() : null,
        availableMinutes,
        currentEnergy: energy || null,
        dateKey,
        role: todayRoleForTask(liveTask.id, dateKey, dailyPlans),
        plannedTaskCount: plannedTaskCountForDate(dateKey, dailyPlans),
      })
      const response = await requestUnlock(body, session.accessToken)
      setResult(response)
      if (response.status === 'completed') {
        setStep('completed')
        return
      }
      if (response.status === 'needs_clarification') {
        setStep('clarification')
        return
      }
      setStep('rejected')
    } catch (caught) {
      const message =
        caught instanceof UnlockTaskApiError
          ? messageForUnlockError(caught)
          : caught instanceof Error
          ? caught.message
          : 'Não foi possível pedir ajuda agora.'
      setError(message)
      if (
        caught instanceof UnlockTaskApiError &&
        caught.code === 'UNAUTHORIZED'
      ) {
        setStep('auth')
        return
      }
      setStep('error')
    }
  }

  function handleApply() {
    if (!liveTask || !plan) {
      return
    }
    applyUnlockPlanToTask(liveTask, plan, {
      updateTaskNextAction,
      updateTaskEnergy,
      updateTaskEstimatedMinutes,
    })
    setApplied(true)
    setApplyOpen(false)
  }

  function handleRetry() {
    setClientRequestId(crypto.randomUUID())
    setResult(null)
    setApplied(false)
    setStep('form')
  }

  const title =
    step === 'completed'
      ? 'Sugestão pronta'
      : step === 'clarification'
      ? 'Preciso de um detalhe'
      : step === 'rejected'
      ? 'Não posso seguir com isso'
      : 'Estou travada'

  return (
    <>
      <Dialog
        open={!!task}
        title={title}
        onClose={onClose}
        className="w-[min(36rem,calc(100vw-2rem))]"
      >
        {liveTask && status === 'loading' && (
          <p className="text-sm text-muted dark:text-muted-dark" role="status">
            Verificando sua sessão…
          </p>
        )}

        {liveTask && status !== 'loading' && step === 'auth' && (
          <div className="space-y-4">
            <p className="text-sm text-ink dark:text-ink-dark">
              Tarefa escolhida: <strong>{liveTask.title}</strong>
            </p>
            <SignInForm />
          </div>
        )}

        {liveTask && step === 'form' && (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-ink dark:text-ink-dark">
              Vamos destravar <strong>{liveTask.title}</strong>. A sugestão não
              altera a tarefa até você aceitar.
            </p>

            <fieldset>
              <legend className="text-sm font-medium">
                O que está travando?
              </legend>
              <div className="mt-2 grid gap-2">
                {BLOCKAGE_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className="flex min-h-11 items-center gap-2 text-sm"
                  >
                    <input
                      type="radio"
                      name="blockage-reason"
                      checked={reason === option.value}
                      onChange={() => setReason(option.value)}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="block space-y-1">
              <span className="text-sm font-medium">
                Quer contar um pouco mais?
                {reason === 'other' ? ' (obrigatório)' : ' (opcional)'}
              </span>
              <textarea
                value={details}
                maxLength={BLOCKAGE_DETAILS_MAX_LENGTH}
                onChange={(event) => setDetails(event.target.value)}
                rows={3}
                className="w-full rounded-xl border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-brand dark:border-line-dark"
              />
            </label>

            <fieldset>
              <legend className="text-sm font-medium">Energia agora</legend>
              <div className="mt-2 grid gap-2">
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="current-energy"
                    checked={energy === ''}
                    onChange={() => setEnergy('')}
                  />
                  Sem definição
                </label>
                {ENERGY_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className="flex min-h-11 items-center gap-2 text-sm"
                  >
                    <input
                      type="radio"
                      name="current-energy"
                      checked={energy === option.value}
                      onChange={() => setEnergy(option.value)}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="block space-y-1">
              <span className="flex items-center justify-between text-sm font-medium">
                Tempo disponível
                <strong>{availableMinutes} min</strong>
              </span>
              <input
                type="range"
                min={MIN_AVAILABLE_MINUTES}
                max={MAX_AVAILABLE_MINUTES}
                value={availableMinutes}
                onChange={(event) =>
                  setAvailableMinutes(Number(event.target.value))
                }
                className="w-full accent-brand"
              />
            </label>

            {error && (
              <p className="text-sm text-danger" role="alert">
                {error}
              </p>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit">Pedir ajuda</Button>
            </div>
          </form>
        )}

        {step === 'loading' && (
          <p className="text-sm text-muted dark:text-muted-dark" role="status">
            Pedindo uma sugestão. Isso não altera a tarefa sozinho.
          </p>
        )}

        {liveTask && step === 'completed' && plan && patch && (
          <CompletedPlan
            task={liveTask}
            plan={plan}
            patch={patch}
            applied={applied}
            onAskApply={() => setApplyOpen(true)}
            onStartFocus={() => {
              startFocusForTask(liveTask.id)
              onClose()
            }}
            onClose={onClose}
          />
        )}

        {step === 'clarification' &&
          result?.status === 'needs_clarification' && (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault()
                setClientRequestId(crypto.randomUUID())
                submit()
              }}
            >
              <p className="text-sm text-ink dark:text-ink-dark">
                {result.question}
              </p>
              <textarea
                value={details}
                maxLength={BLOCKAGE_DETAILS_MAX_LENGTH}
                onChange={(event) => setDetails(event.target.value)}
                rows={3}
                required
                className="w-full rounded-xl border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-brand dark:border-line-dark"
              />
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="secondary" onClick={onClose}>
                  Agora não
                </Button>
                <Button type="submit">Responder e pedir de novo</Button>
              </div>
            </form>
          )}

        {step === 'rejected' && result?.status === 'rejected' && (
          <div className="space-y-4">
            <p className="text-sm text-ink dark:text-ink-dark">
              {result.message}
            </p>
            <div className="flex justify-end">
              <Button type="button" variant="secondary" onClick={onClose}>
                Fechar
              </Button>
            </div>
          </div>
        )}

        {step === 'error' && (
          <div className="space-y-4">
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" onClick={onClose}>
                Fechar
              </Button>
              <Button type="button" onClick={handleRetry}>
                Tentar de novo
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={applyOpen}
        title="Aplicar a sugestão?"
        description={
          patch
            ? `Isso atualiza só o próximo passo, a energia e a estimativa da tarefa. O título permanece “${
                liveTask?.title ?? ''
              }”. O ciclo de foco não muda sozinho.`
            : ''
        }
        confirmLabel="Sim, aplicar"
        onConfirm={handleApply}
        onClose={() => setApplyOpen(false)}
      />
    </>
  )
}

function CompletedPlan({
  task,
  plan,
  patch,
  applied,
  onAskApply,
  onStartFocus,
  onClose,
}: {
  task: Task
  plan: UnlockPlan
  patch: ReturnType<typeof unlockPlanTaskPatch>
  applied: boolean
  onAskApply: () => void
  onStartFocus: () => void
  onClose: () => void
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted dark:text-muted-dark">
        Isto é uma sugestão para <strong>{task.title}</strong>. Nada foi gravado
        na tarefa ainda.
      </p>
      <div>
        <h3 className="text-base font-bold">{plan.title}</h3>
        <p className="mt-1 text-sm text-muted dark:text-muted-dark">
          {plan.summary}
        </p>
      </div>
      <p className="text-sm">
        <span className="text-muted dark:text-muted-dark">Comece por: </span>
        {plan.nextAction}
      </p>
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        {plan.steps.map((item) => (
          <li key={item.order}>
            {item.title}{' '}
            <span className="text-muted dark:text-muted-dark">
              ({item.minutes} min)
            </span>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted dark:text-muted-dark">
        Foco sugerido: {patch.estimatedMinutes} min · Energia:{' '}
        {energyLabel(patch.energy)}
      </p>
      <p className="text-sm text-ink dark:text-ink-dark">
        {plan.supportiveMessage}
      </p>
      {applied && (
        <p className="text-sm text-ink dark:text-ink-dark" role="status">
          Sugestão aplicada. O título da tarefa continua o mesmo.
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Só guardar na cabeça
        </Button>
        {!applied && (
          <Button type="button" variant="secondary" onClick={onAskApply}>
            Aplicar à tarefa
          </Button>
        )}
        <Button type="button" onClick={onStartFocus}>
          Iniciar foco
        </Button>
      </div>
    </div>
  )
}
