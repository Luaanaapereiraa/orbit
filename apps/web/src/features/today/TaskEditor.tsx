'use client'

import { type FormEvent, useEffect, useRef, useState } from 'react'
import type { Task, TaskEnergy } from '@destravai/core'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { ENERGY_OPTIONS } from '../../lib/energy'
import { ESTIMATE_PRESETS, isValidTaskEstimate } from '../../lib/task-estimate'
import { usePomodoro } from '../../contexts/PomodoroContext'

interface TaskEditorProps {
  task: Task | null
  onClose: () => void
}

type EstimateMode = 'none' | 'preset' | 'custom'

function estimateModeOf(value: number | null): EstimateMode {
  if (value === null) {
    return 'none'
  }

  return (ESTIMATE_PRESETS as readonly number[]).includes(value)
    ? 'preset'
    : 'custom'
}

export function TaskEditor({ task, onClose }: TaskEditorProps) {
  const {
    updateTaskTitle,
    updateTaskNextAction,
    updateTaskEnergy,
    updateTaskEstimatedMinutes,
  } = usePomodoro()
  const titleRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState(task?.title ?? '')
  const [nextAction, setNextAction] = useState(task?.nextAction ?? '')
  const [energy, setEnergy] = useState<TaskEnergy | ''>(task?.energy ?? '')
  const [estimateMode, setEstimateMode] = useState<EstimateMode>(
    estimateModeOf(task?.estimatedMinutes ?? null),
  )
  const [preset, setPreset] = useState(
    estimateModeOf(task?.estimatedMinutes ?? null) === 'preset'
      ? String(task?.estimatedMinutes)
      : '25',
  )
  const [custom, setCustom] = useState(
    estimateModeOf(task?.estimatedMinutes ?? null) === 'custom'
      ? String(task?.estimatedMinutes)
      : '',
  )
  const [error, setError] = useState('')

  useEffect(() => {
    if (!task) {
      return
    }

    setTitle(task.title)
    setNextAction(task.nextAction ?? '')
    setEnergy(task.energy ?? '')
    setEstimateMode(estimateModeOf(task.estimatedMinutes))
    setPreset(
      estimateModeOf(task.estimatedMinutes) === 'preset'
        ? String(task.estimatedMinutes)
        : '25',
    )
    setCustom(
      estimateModeOf(task.estimatedMinutes) === 'custom'
        ? String(task.estimatedMinutes)
        : '',
    )
    setError('')
  }, [task])

  function resolvedEstimate(): number | null | undefined {
    if (estimateMode === 'none') {
      return null
    }

    if (estimateMode === 'preset') {
      const value = Number(preset)
      return isValidTaskEstimate(value) ? value : undefined
    }

    const trimmed = custom.trim()

    if (!trimmed) {
      return undefined
    }

    if (!/^\d+$/.test(trimmed)) {
      return undefined
    }

    const value = Number(trimmed)
    return isValidTaskEstimate(value) ? value : undefined
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()

    if (!task) {
      return
    }

    const trimmedTitle = title.trim()

    if (!trimmedTitle) {
      setError('Dê um nome para esta tarefa.')
      titleRef.current?.focus()
      return
    }

    const estimatedMinutes = resolvedEstimate()

    if (estimatedMinutes === undefined) {
      setError('A estimativa precisa ser um número inteiro positivo, em minutos.')
      return
    }

    updateTaskTitle(task.id, trimmedTitle)
    updateTaskNextAction(task.id, nextAction.trim() ? nextAction.trim() : null)
    updateTaskEnergy(task.id, energy || null)
    updateTaskEstimatedMinutes(task.id, estimatedMinutes)
    onClose()
  }

  return (
    <Dialog
      open={!!task}
      title="Editar tarefa"
      onClose={onClose}
      initialFocusRef={titleRef}
    >
      {task && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="task-editor-title"
              className="text-sm font-medium text-ink dark:text-ink-dark"
            >
              Título
            </label>
            <input
              id="task-editor-title"
              ref={titleRef}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              aria-invalid={error.includes('nome') || undefined}
              aria-describedby={error ? 'task-editor-error' : undefined}
              className="mt-1 h-11 w-full rounded-xl border border-line bg-transparent px-3 text-sm text-ink outline-none focus:border-brand focus-visible:ring-2 focus-visible:ring-brand dark:border-line-dark dark:text-ink-dark"
            />
          </div>

          <div>
            <label
              htmlFor="task-editor-next"
              className="text-sm font-medium text-ink dark:text-ink-dark"
            >
              Qual é o menor passo concreto para começar?
            </label>
            <textarea
              id="task-editor-next"
              value={nextAction}
              onChange={(event) => setNextAction(event.target.value)}
              placeholder="Abrir o documento e escrever o primeiro parágrafo."
              rows={3}
              className="mt-1 w-full rounded-xl border border-line bg-transparent px-3 py-2 text-sm text-ink outline-none focus:border-brand focus-visible:ring-2 focus-visible:ring-brand dark:border-line-dark dark:text-ink-dark"
            />
          </div>

          <fieldset>
            <legend className="text-sm font-medium text-ink dark:text-ink-dark">
              Energia
            </legend>
            <div className="mt-2 grid gap-2">
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="task-energy"
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
                    name="task-energy"
                    checked={energy === option.value}
                    onChange={() => setEnergy(option.value)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-medium text-ink dark:text-ink-dark">
              Estimativa de esforço
            </legend>
            <p className="mt-1 text-xs text-muted dark:text-muted-dark">
              Isso não altera a duração do ciclo de foco.
            </p>
            <div className="mt-2 grid gap-2">
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="task-estimate"
                  checked={estimateMode === 'none'}
                  onChange={() => setEstimateMode('none')}
                />
                Sem estimativa
              </label>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="task-estimate"
                  checked={estimateMode === 'preset'}
                  onChange={() => setEstimateMode('preset')}
                />
                Preset
              </label>
              {estimateMode === 'preset' && (
                <select
                  value={preset}
                  onChange={(event) => setPreset(event.target.value)}
                  className="h-11 rounded-xl border border-line bg-transparent px-3 text-sm dark:border-line-dark"
                  aria-label="Minutos estimados"
                >
                  {ESTIMATE_PRESETS.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {minutes} min
                    </option>
                  ))}
                </select>
              )}
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="task-estimate"
                  checked={estimateMode === 'custom'}
                  onChange={() => setEstimateMode('custom')}
                />
                Personalizada
              </label>
              {estimateMode === 'custom' && (
                <input
                  inputMode="numeric"
                  value={custom}
                  onChange={(event) => setCustom(event.target.value)}
                  placeholder="Minutos"
                  aria-label="Estimativa personalizada em minutos"
                  className="h-11 rounded-xl border border-line bg-transparent px-3 text-sm dark:border-line-dark"
                />
              )}
            </div>
          </fieldset>

          {error && (
            <p id="task-editor-error" className="text-sm text-danger" role="alert">
              {error}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit">Salvar</Button>
          </div>
        </form>
      )}
    </Dialog>
  )
}
