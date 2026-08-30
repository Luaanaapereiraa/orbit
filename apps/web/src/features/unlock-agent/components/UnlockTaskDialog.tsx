'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '../../../components/ui/Button'
import { Dialog } from '../../../components/ui/Dialog'
import { useAuth } from '../../../contexts/AuthContext'
import { usePomodoro } from '../../../contexts/PomodoroContext'
import { toLocalDateKey, useLocalDateKey } from '../../../lib/local-date'
import { runUnlockTaskAgent } from '../api/unlock-agent-client'
import { useUnlockTaskAgent } from '../hooks/useUnlockTaskAgent'
import {
  canRequestUnlock,
  eligibleUnlockTasks,
  suggestUnlockTask,
} from '../mappings'
import { UnlockTaskClarification } from './UnlockTaskClarification'
import { UnlockTaskErrorView } from './UnlockTaskError'
import { UnlockTaskForm } from './UnlockTaskForm'
import { UnlockTaskLoading } from './UnlockTaskLoading'
import { UnlockTaskPlan } from './UnlockTaskPlan'
import { UnlockTaskRejected } from './UnlockTaskRejected'

const STALE_TASK_MESSAGE =
  'Esta tarefa mudou enquanto o plano era criado. O plano não foi aplicado.'

const STALE_FORM_TASK_MESSAGE =
  'A tarefa selecionada não está mais disponível. Escolha outra para continuar.'

interface UnlockTaskDialogProps {
  open: boolean
  preferredTaskId?: string | null
  onClose: () => void
  run?: typeof runUnlockTaskAgent
  now?: () => number
}

export function UnlockTaskDialog({
  open,
  preferredTaskId = null,
  onClose,
  run,
  now,
}: UnlockTaskDialogProps) {
  const router = useRouter()
  const { session, isLoading, getAccessToken } = useAuth()
  const {
    hydrated,
    tasks,
    dailyPlans,
    selectedTaskId,
    settings,
    activeCycle,
    startFocusForTask,
    applyUnlockPlan,
  } = usePomodoro()
  const dateKey =
    useLocalDateKey(hydrated) ?? (hydrated ? toLocalDateKey() : null)
  const eligible = useMemo(() => eligibleUnlockTasks(tasks), [tasks])
  const suggested = useMemo(
    () =>
      dateKey
        ? suggestUnlockTask({
            tasks,
            dailyPlans,
            dateKey,
            selectedTaskId,
            preferredTaskId,
          })
        : null,
    [dailyPlans, dateKey, preferredTaskId, selectedTaskId, tasks],
  )

  const agent = useUnlockTaskAgent({
    initialTaskId: suggested?.id ?? '',
    availableMinutes: settings.focusMinutes,
    run,
    now,
  })

  const [confirm, setConfirm] = useState<'apply' | 'focus' | null>(null)
  const [focusBlocked, setFocusBlocked] = useState(false)
  const [justApplied, setJustApplied] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [retryTick, setRetryTick] = useState(0)
  const wasOpenRef = useRef(false)
  const actionLockRef = useRef(false)
  const appliedTaskIdRef = useRef<string | null>(null)
  const focusStartInFlightRef = useRef(false)
  const [focusStarting, setFocusStarting] = useState(false)

  useEffect(() => {
    if (!open) {
      if (wasOpenRef.current) {
        agent.cancelWait()
      }
      wasOpenRef.current = false
      return
    }

    const canInitialize = hydrated || suggested !== null
    if (!wasOpenRef.current && canInitialize) {
      agent.reset(suggested?.id ?? '', settings.focusMinutes)
      setConfirm(null)
      setFocusBlocked(false)
      setJustApplied(false)
      setApplyError(null)
      appliedTaskIdRef.current = null
      focusStartInFlightRef.current = false
      setFocusStarting(false)
      wasOpenRef.current = true
    }
    // Initialize only when the dialog opens and a selection can be resolved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, open, settings.focusMinutes, suggested])

  const submitted = agent.state.submitted
  const submittedTask =
    submitted !== null
      ? tasks.find((task) => task.id === submitted.taskId) ?? null
      : null
  const submittedEligible =
    submittedTask !== null && canRequestUnlock(submittedTask)

  const selectedFormTask =
    eligible.find((task) => task.id === agent.state.fields.taskId) ?? null
  const formSelectionStale =
    agent.state.status === 'form' &&
    agent.state.fields.taskId.length > 0 &&
    selectedFormTask === null
  const formTask = formSelectionStale ? null : selectedFormTask

  const showingResult =
    agent.state.status === 'completed' ||
    agent.state.status === 'applied' ||
    agent.state.status === 'needs_clarification' ||
    agent.state.status === 'rejected'

  const staleSubmittedTask =
    showingResult && submitted !== null && !submittedEligible

  const retryAvailableAt =
    agent.state.status === 'error' ? agent.state.retryAvailableAt : null
  const retryRemainingMs =
    retryAvailableAt === null
      ? 0
      : Math.max(0, retryAvailableAt - (now?.() ?? Date.now()))
  const retryDisabled = retryRemainingMs > 0

  useEffect(() => {
    if (!retryDisabled) {
      return
    }
    const timer = window.setTimeout(() => {
      setRetryTick((value) => value + 1)
    }, Math.min(retryRemainingMs, 250))
    return () => window.clearTimeout(timer)
  }, [retryDisabled, retryRemainingMs, retryTick])

  function closeDialog() {
    agent.cancelWait()
    setConfirm(null)
    setFocusBlocked(false)
    setApplyError(null)
    onClose()
  }

  function handleDialogClose() {
    if (confirm) {
      setConfirm(null)
      return
    }
    closeDialog()
  }

  async function send(extraDetails?: string) {
    const taskForSubmit =
      extraDetails !== undefined ||
      agent.state.status === 'needs_clarification' ||
      agent.state.status === 'error'
        ? submittedTask
        : selectedFormTask
    if (!taskForSubmit || !dateKey || !canRequestUnlock(taskForSubmit)) {
      return
    }
    setApplyError(null)
    await agent.submit(
      taskForSubmit,
      dateKey,
      dailyPlans,
      getAccessToken,
      extraDetails,
    )
  }

  function applyToSubmittedTask() {
    const response =
      agent.state.status === 'completed' || agent.state.status === 'applied'
        ? agent.state.response
        : null
    if (!submitted || !response) {
      return { status: 'task_not_found' as const }
    }

    const target = tasks.find((task) => task.id === submitted.taskId) ?? null
    if (!target || submitted.taskId !== target.id) {
      return { status: 'task_not_found' as const }
    }
    if (!canRequestUnlock(target)) {
      return { status: 'task_not_eligible' as const }
    }

    if (
      appliedTaskIdRef.current === submitted.taskId ||
      (agent.state.status === 'applied' &&
        agent.state.appliedTaskId === submitted.taskId)
    ) {
      return { status: 'applied' as const, taskId: submitted.taskId }
    }

    const result = applyUnlockPlan({
      taskId: submitted.taskId,
      nextAction: response.plan.nextAction,
      estimatedMinutes: response.plan.totalMinutes,
      energy: response.plan.energy,
    })

    if (result.status === 'applied' && result.taskId === submitted.taskId) {
      appliedTaskIdRef.current = submitted.taskId
      agent.markApplied(submitted.taskId)
      setJustApplied(true)
      setApplyError(null)
      return result
    }

    return result
  }

  function handleUsePlan() {
    setConfirm('apply')
  }

  function releaseFocusStart() {
    focusStartInFlightRef.current = false
    setFocusStarting(false)
  }

  function handleStartFocus() {
    if (focusStartInFlightRef.current || actionLockRef.current) {
      return
    }
    if (activeCycle) {
      setFocusBlocked(true)
      return
    }
    const alreadyApplied =
      appliedTaskIdRef.current === submitted?.taskId ||
      (agent.state.status === 'applied' &&
        agent.state.appliedTaskId === submitted?.taskId)
    if (agent.state.status === 'completed' && !alreadyApplied) {
      setConfirm('focus')
      return
    }
    startSubmittedFocus()
  }

  function startSubmittedFocus() {
    if (focusStartInFlightRef.current) {
      return
    }
    focusStartInFlightRef.current = true
    setFocusStarting(true)

    if (!submitted) {
      releaseFocusStart()
      return
    }
    const alreadyApplied =
      appliedTaskIdRef.current === submitted.taskId ||
      (agent.state.status === 'applied' &&
        agent.state.appliedTaskId === submitted.taskId)
    if (!alreadyApplied) {
      const result = applyToSubmittedTask()
      if (result.status !== 'applied') {
        setApplyError(STALE_TASK_MESSAGE)
        setJustApplied(false)
        releaseFocusStart()
        return
      }
    } else {
      const target =
        tasks.find((task) => task.id === submitted.taskId) ?? null
      if (!target || !canRequestUnlock(target)) {
        setApplyError(STALE_TASK_MESSAGE)
        releaseFocusStart()
        return
      }
    }

    if (activeCycle) {
      setFocusBlocked(true)
      releaseFocusStart()
      return
    }

    const focusResult = startFocusForTask(submitted.taskId)
    if (focusResult.status === 'active_cycle_exists') {
      setFocusBlocked(true)
      releaseFocusStart()
      return
    }
    if (focusResult.status === 'start_in_progress') {
      return
    }
    if (focusResult.status === 'started') {
      closeDialog()
      router.push('/focus')
      return
    }

    setApplyError(STALE_TASK_MESSAGE)
    releaseFocusStart()
  }

  function confirmAction() {
    if (actionLockRef.current || focusStartInFlightRef.current) {
      return
    }
    actionLockRef.current = true
    try {
      if (confirm === 'apply') {
        const result = applyToSubmittedTask()
        if (result.status !== 'applied') {
          setApplyError(STALE_TASK_MESSAGE)
          setJustApplied(false)
        }
      }
      if (confirm === 'focus') {
        actionLockRef.current = false
        startSubmittedFocus()
        setConfirm(null)
        return
      }
      setConfirm(null)
    } finally {
      actionLockRef.current = false
    }
  }

  function startOverForAnotherTask() {
    const other = eligible.find((task) => task.id !== submitted?.taskId)
    agent.reset(other?.id ?? suggested?.id ?? '', settings.focusMinutes)
    setConfirm(null)
    setJustApplied(false)
    setApplyError(null)
    appliedTaskIdRef.current = null
    releaseFocusStart()
  }

  function chooseAnotherFormTask() {
    const next = suggested ?? eligible[0] ?? null
    agent.reset(next?.id ?? '', settings.focusMinutes)
    setApplyError(null)
  }

  const signedIn = !!session && !isLoading
  const applied =
    agent.state.status === 'applied' ||
    (agent.state.status === 'completed' && agent.state.applied) ||
    justApplied
  const focusKey = [
    agent.state.status,
    confirm ?? 'none',
    applyError ? 'apply-error' : 'ok',
    staleSubmittedTask ? 'stale' : 'fresh',
    formSelectionStale ? 'form-stale' : 'form-ok',
    agent.state.status === 'form' ? agent.state.formError?.message ?? '' : '',
  ].join(':')

  return (
    <Dialog
      open={open}
      title={
        confirm === 'focus'
          ? 'Usar este plano e começar o foco?'
          : confirm === 'apply'
          ? 'Usar este plano?'
          : 'Estou travada'
      }
      description={
        confirm
          ? 'A próxima ação, a energia e o tempo estimado da tarefa serão atualizados. O título e o plano do dia permanecem iguais.'
          : 'Peça um próximo passo pequeno. A tarefa só muda se você usar o plano.'
      }
      onClose={handleDialogClose}
      focusKey={focusKey}
    >
      {confirm ? (
        <div className="space-y-4">
          <p className="text-sm text-muted dark:text-muted-dark">
            A próxima ação, a energia e o tempo estimado da tarefa serão
            atualizados. O título e o plano do dia permanecem iguais.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setConfirm(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              data-initial-focus=""
              disabled={focusStarting}
              onClick={confirmAction}
            >
              Usar este plano
            </Button>
          </div>
        </div>
      ) : !signedIn ? (
        <div className="space-y-4">
          <p className="text-sm text-muted dark:text-muted-dark">
            Entre para receber um próximo passo criado para esta tarefa. Seu
            planner continua funcionando normalmente sem login.
          </p>
          <Button
            type="button"
            data-initial-focus=""
            onClick={() => router.push('/login')}
          >
            Entrar para usar o agente
          </Button>
        </div>
      ) : staleSubmittedTask ? (
        <div className="space-y-4">
          <p className="text-sm text-danger" role="alert">
            {STALE_TASK_MESSAGE}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" data-initial-focus="" onClick={closeDialog}>
              Fechar
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                agent.backToForm(true)
                setApplyError(null)
                appliedTaskIdRef.current = null
              }}
            >
              Voltar ao formulário
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={startOverForAnotherTask}
            >
              Criar um novo plano para outra tarefa
            </Button>
          </div>
        </div>
      ) : formSelectionStale ? (
        <div className="space-y-4">
          <p className="text-sm text-danger" role="alert">
            {STALE_FORM_TASK_MESSAGE}
          </p>
          <Button
            type="button"
            data-initial-focus=""
            onClick={chooseAnotherFormTask}
            disabled={eligible.length === 0}
          >
            Escolher outra tarefa
          </Button>
        </div>
      ) : !formTask && agent.state.status === 'form' ? (
        <p className="text-sm text-muted dark:text-muted-dark" role="status">
          Não há tarefa elegível agora. Capture ou reabra uma tarefa para pedir
          ajuda.
        </p>
      ) : agent.state.status === 'submitting' ? (
        <UnlockTaskLoading
          onCancel={() => {
            agent.cancelWait()
            agent.backToForm(false)
          }}
        />
      ) : agent.state.status === 'completed' ||
        agent.state.status === 'applied' ? (
        <div className="space-y-4">
          {applyError ? (
            <p className="text-sm text-danger" role="alert">
              {applyError}
            </p>
          ) : null}
          <UnlockTaskPlan
            response={agent.state.response}
            applied={applied && !applyError}
            focusMinutes={settings.focusMinutes}
            focusDisabled={focusStarting}
            onUsePlan={handleUsePlan}
            onStartFocus={handleStartFocus}
            onRetry={() => {
              agent.backToForm(true)
              setJustApplied(false)
              setApplyError(null)
              appliedTaskIdRef.current = null
            }}
            onDismiss={closeDialog}
          />
        </div>
      ) : agent.state.status === 'needs_clarification' ? (
        <UnlockTaskClarification
          question={agent.state.response.question}
          onContinue={(answer) => {
            send(answer)
          }}
        />
      ) : agent.state.status === 'rejected' ? (
        <UnlockTaskRejected
          message={agent.state.response.message}
          onClose={closeDialog}
        />
      ) : agent.state.status === 'error' ? (
        <UnlockTaskErrorView
          error={agent.state.error}
          retryDisabled={retryDisabled}
          retryHint={
            retryDisabled
              ? `Aguarde ${Math.ceil(
                  retryRemainingMs / 1000,
                )}s para consultar de novo.`
              : null
          }
          onRetry={() => send()}
          onSignIn={() => router.push('/login')}
          onClose={closeDialog}
        />
      ) : (
        <UnlockTaskForm
          fields={agent.state.fields}
          tasks={eligible}
          selectedTask={formTask}
          onChange={agent.patchFields}
          onSubmit={() => send()}
          disabled={agent.state.status !== 'form'}
          formError={agent.state.formError}
          fieldErrors={agent.state.fieldErrors}
        />
      )}

      {focusBlocked ? (
        <div className="mt-4 space-y-2 rounded-xl border border-line px-3 py-3 dark:border-line-dark">
          <p className="text-sm text-ink dark:text-ink-dark" role="status">
            Já existe um ciclo em andamento. Ele não foi interrompido.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => {
                closeDialog()
                router.push('/focus')
              }}
            >
              Ir para o foco atual
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setFocusBlocked(false)}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}
    </Dialog>
  )
}
