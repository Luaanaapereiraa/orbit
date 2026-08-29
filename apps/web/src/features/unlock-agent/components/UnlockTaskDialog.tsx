'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '../../../components/ui/Button'
import { Dialog } from '../../../components/ui/Dialog'
import { useAuth } from '../../../contexts/AuthContext'
import { usePomodoro } from '../../../contexts/PomodoroContext'
import { toLocalDateKey, useLocalDateKey } from '../../../lib/local-date'
import { ConfirmDialog } from '../../today/ConfirmDialog'
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

interface UnlockTaskDialogProps {
  open: boolean
  preferredTaskId?: string | null
  onClose: () => void
  run?: typeof runUnlockTaskAgent
}

export function UnlockTaskDialog({
  open,
  preferredTaskId = null,
  onClose,
  run,
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
  })

  const [confirm, setConfirm] = useState<'apply' | 'focus' | null>(null)
  const [focusBlocked, setFocusBlocked] = useState(false)
  const [justApplied, setJustApplied] = useState(false)

  useEffect(() => {
    if (!open || !suggested) {
      return
    }
    agent.reset(suggested.id, settings.focusMinutes)
    setConfirm(null)
    setFocusBlocked(false)
    setJustApplied(false)
    // Reset only when the dialog opens or the suggested task changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, suggested?.id, settings.focusMinutes])

  const selectedTask =
    eligible.find((task) => task.id === agent.state.fields.taskId) ??
    suggested ??
    null

  function closeDialog() {
    if (agent.state.status === 'submitting') {
      agent.cancelWait()
    }
    setConfirm(null)
    setFocusBlocked(false)
    onClose()
  }

  async function send(extraDetails?: string) {
    if (!selectedTask || !dateKey || !canRequestUnlock(selectedTask)) {
      return
    }
    const token = await getAccessToken()
    if (!token) {
      router.push('/login')
      return
    }
    await agent.submit(selectedTask, dateKey, dailyPlans, token, extraDetails)
  }

  function applyPlan() {
    const response =
      agent.state.status === 'completed' || agent.state.status === 'applied'
        ? agent.state.response
        : null
    if (!selectedTask || !response) {
      return
    }
    applyUnlockPlan({
      taskId: selectedTask.id,
      nextAction: response.plan.nextAction,
      estimatedMinutes: response.plan.totalMinutes,
      energy: response.plan.energy,
    })
    agent.markApplied()
    setJustApplied(true)
  }

  function handleUsePlan() {
    setConfirm('apply')
  }

  function handleStartFocus() {
    if (activeCycle) {
      setFocusBlocked(true)
      return
    }
    if (agent.state.status === 'completed' && !agent.state.applied) {
      setConfirm('focus')
      return
    }
    startSelectedFocus()
  }

  function startSelectedFocus() {
    if (!selectedTask) {
      return
    }
    const result = startFocusForTask(selectedTask.id)
    if (result === 'already-active') {
      setFocusBlocked(true)
      return
    }
    if (result === 'started') {
      closeDialog()
      router.push('/focus')
    }
  }

  function confirmAction() {
    if (confirm === 'apply') {
      applyPlan()
    }
    if (confirm === 'focus') {
      applyPlan()
      startSelectedFocus()
    }
    setConfirm(null)
  }

  const signedIn = !!session && !isLoading

  return (
    <>
      <Dialog
        open={open}
        title="Estou travada"
        description="Peça um próximo passo pequeno. A tarefa só muda se você usar o plano."
        onClose={closeDialog}
      >
        {!signedIn ? (
          <div className="space-y-4">
            <p className="text-sm text-muted dark:text-muted-dark">
              Entre para receber um próximo passo criado para esta tarefa. Seu
              planner continua funcionando normalmente sem login.
            </p>
            <Button type="button" onClick={() => router.push('/login')}>
              Entrar para usar o agente
            </Button>
          </div>
        ) : !selectedTask ? (
          <p className="text-sm text-muted dark:text-muted-dark" role="status">
            Não há tarefa elegível agora. Capture ou reabra uma tarefa para
            pedir ajuda.
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
          <UnlockTaskPlan
            response={agent.state.response}
            applied={
              agent.state.status === 'applied' ||
              (agent.state.status === 'completed' && agent.state.applied) ||
              justApplied
            }
            focusMinutes={settings.focusMinutes}
            onUsePlan={handleUsePlan}
            onStartFocus={handleStartFocus}
            onRetry={() => agent.backToForm(true)}
            onDismiss={closeDialog}
          />
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
            onRetry={() => send()}
            onSignIn={() => router.push('/login')}
            onClose={closeDialog}
          />
        ) : (
          <UnlockTaskForm
            fields={agent.state.fields}
            tasks={eligible}
            selectedTask={selectedTask}
            onChange={agent.patchFields}
            onSubmit={() => send()}
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

      <ConfirmDialog
        open={confirm !== null}
        title={
          confirm === 'focus'
            ? 'Usar este plano e começar o foco?'
            : 'Usar este plano?'
        }
        description="A próxima ação, a energia e o tempo estimado da tarefa serão atualizados. O título e o plano do dia permanecem iguais."
        confirmLabel="Usar este plano"
        confirmVariant="primary"
        onConfirm={confirmAction}
        onClose={() => setConfirm(null)}
      />
    </>
  )
}
