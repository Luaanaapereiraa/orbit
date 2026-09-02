'use client'

import { type FormEvent, useEffect, useRef } from 'react'
import type { Task } from '@destravai/core'
import { BLOCKAGE_DETAILS_MAX_LENGTH } from '@destravai/contracts'
import { Button } from '../../../components/ui/Button'
import {
  AVAILABLE_MINUTE_CHIPS,
  BLOCKAGE_OPTIONS,
  ENERGY_OPTIONS,
  firstInvalidUnlockField,
  type UnlockFormFields,
} from '../mappings'
import type { UnlockFieldErrors } from '../types'
import type { UnlockAgentError } from '../api/unlock-agent-errors'

interface UnlockTaskFormProps {
  fields: UnlockFormFields
  tasks: Task[]
  selectedTask: Task | null
  onChange: (fields: Partial<UnlockFormFields>, refreshId?: boolean) => void
  onSubmit: () => void
  disabled?: boolean
  formError?: UnlockAgentError | null
  fieldErrors?: UnlockFieldErrors
}

export function UnlockTaskForm({
  fields,
  tasks,
  selectedTask,
  onChange,
  onSubmit,
  disabled,
  formError = null,
  fieldErrors = {},
}: UnlockTaskFormProps) {
  const taskRef = useRef<HTMLSelectElement>(null)
  const detailsRef = useRef<HTMLTextAreaElement>(null)
  const firstInvalid = firstInvalidUnlockField(fieldErrors)

  useEffect(() => {
    if (firstInvalid === 'taskId') {
      taskRef.current?.focus()
      return
    }
    if (firstInvalid === 'blockageDetails') {
      detailsRef.current?.focus()
    }
  }, [firstInvalid, formError])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (disabled) {
      return
    }
    onSubmit()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {formError ? (
        <div
          className="rounded-xl border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger"
          role="alert"
          tabIndex={-1}
        >
          {formError.message}
        </div>
      ) : null}

      <label className="block space-y-1">
        <span className="text-sm font-medium">Tarefa</span>
        <select
          ref={taskRef}
          data-initial-focus={
            firstInvalid === 'taskId' || !firstInvalid ? '' : undefined
          }
          value={fields.taskId}
          disabled={disabled}
          aria-invalid={!!fieldErrors.taskId}
          aria-describedby={
            fieldErrors.taskId ? 'unlock-task-error' : undefined
          }
          onChange={(event) => onChange({ taskId: event.target.value })}
          className="h-11 w-full rounded-xl border border-line bg-transparent px-3 text-sm outline-none focus:border-brand dark:border-line-dark"
        >
          {tasks.map((task) => (
            <option key={task.id} value={task.id}>
              {task.title}
            </option>
          ))}
        </select>
        {fieldErrors.taskId ? (
          <p id="unlock-task-error" className="text-sm text-danger">
            {fieldErrors.taskId}
          </p>
        ) : null}
      </label>

      {selectedTask?.nextAction ? (
        <p className="text-sm text-muted dark:text-muted-dark">
          Próximo passo atual: {selectedTask.nextAction}
        </p>
      ) : null}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">O que está travando?</legend>
        <div className="grid gap-2">
          {BLOCKAGE_OPTIONS.map((option, index) => (
            <label
              key={option.value}
              className="flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 text-sm dark:border-line-dark"
            >
              <input
                type="radio"
                name="blockageReason"
                value={option.value}
                checked={fields.blockageReason === option.value}
                disabled={disabled}
                data-initial-focus={
                  firstInvalid === 'blockageReason' && index === 0
                    ? ''
                    : undefined
                }
                onChange={() => onChange({ blockageReason: option.value })}
              />
              {option.label}
            </label>
          ))}
        </div>
        {fieldErrors.blockageReason ? (
          <p className="text-sm text-danger">{fieldErrors.blockageReason}</p>
        ) : null}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Energia atual</legend>
        <div className="flex flex-wrap gap-2">
          {ENERGY_OPTIONS.map((option, index) => (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              data-initial-focus={
                firstInvalid === 'currentEnergy' && index === 0 ? '' : undefined
              }
              onClick={() => onChange({ currentEnergy: option.value })}
              className={`h-11 rounded-xl px-4 text-sm font-bold focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none ${
                fields.currentEnergy === option.value
                  ? 'bg-brand text-white'
                  : 'bg-line text-ink dark:bg-line-dark dark:text-ink-dark'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        {fieldErrors.currentEnergy ? (
          <p className="text-sm text-danger">{fieldErrors.currentEnergy}</p>
        ) : null}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Tempo disponível</legend>
        <div className="flex flex-wrap gap-2">
          {AVAILABLE_MINUTE_CHIPS.map((minutes, index) => (
            <button
              key={minutes}
              type="button"
              disabled={disabled}
              data-initial-focus={
                firstInvalid === 'availableMinutes' && index === 0
                  ? ''
                  : undefined
              }
              onClick={() => onChange({ availableMinutes: minutes })}
              className={`h-11 rounded-xl px-4 text-sm font-bold focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none ${
                fields.availableMinutes === minutes
                  ? 'bg-brand text-white'
                  : 'bg-line text-ink dark:bg-line-dark dark:text-ink-dark'
              }`}
            >
              {minutes} min
            </button>
          ))}
        </div>
        {fieldErrors.availableMinutes ? (
          <p className="text-sm text-danger">{fieldErrors.availableMinutes}</p>
        ) : null}
      </fieldset>

      <label className="block space-y-1" htmlFor="unlock-details">
        <span className="text-sm font-medium">Detalhes (opcional)</span>
        <textarea
          id="unlock-details"
          ref={detailsRef}
          value={fields.blockageDetails}
          maxLength={BLOCKAGE_DETAILS_MAX_LENGTH}
          disabled={disabled}
          aria-invalid={!!fieldErrors.blockageDetails}
          aria-describedby={
            fieldErrors.blockageDetails ? 'unlock-details-error' : undefined
          }
          data-initial-focus={
            firstInvalid === 'blockageDetails' ? '' : undefined
          }
          onChange={(event) =>
            onChange({ blockageDetails: event.target.value })
          }
          rows={3}
          className="w-full rounded-xl border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-brand dark:border-line-dark"
        />
      </label>
      {fieldErrors.blockageDetails ? (
        <p id="unlock-details-error" className="text-sm text-danger">
          {fieldErrors.blockageDetails}
        </p>
      ) : null}

      {fields.blockageReason === 'other' && !fields.blockageDetails.trim() ? (
        <p className="text-sm text-danger" role="alert">
          Descreva o motivo para eu entender o bloqueio.
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={
          disabled ||
          !selectedTask ||
          (fields.blockageReason === 'other' && !fields.blockageDetails.trim())
        }
      >
        Criar meu próximo passo
      </Button>
    </form>
  )
}
