'use client'

import type { FormEvent } from 'react'
import type { Task } from '@destravai/core'
import { Button } from '../../../components/ui/Button'
import {
  AVAILABLE_MINUTE_CHIPS,
  BLOCKAGE_OPTIONS,
  ENERGY_OPTIONS,
  type UnlockFormFields,
} from '../mappings'
import { BLOCKAGE_DETAILS_MAX_LENGTH } from '@destravai/contracts'

interface UnlockTaskFormProps {
  fields: UnlockFormFields
  tasks: Task[]
  selectedTask: Task | null
  onChange: (fields: Partial<UnlockFormFields>, refreshId?: boolean) => void
  onSubmit: () => void
  disabled?: boolean
}

export function UnlockTaskForm({
  fields,
  tasks,
  selectedTask,
  onChange,
  onSubmit,
  disabled,
}: UnlockTaskFormProps) {
  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onSubmit()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block space-y-1">
        <span className="text-sm font-medium">Tarefa</span>
        <select
          value={fields.taskId}
          disabled={disabled}
          onChange={(event) => onChange({ taskId: event.target.value }, true)}
          className="h-11 w-full rounded-xl border border-line bg-transparent px-3 text-sm outline-none focus:border-brand dark:border-line-dark"
        >
          {tasks.map((task) => (
            <option key={task.id} value={task.id}>
              {task.title}
            </option>
          ))}
        </select>
      </label>

      {selectedTask?.nextAction ? (
        <p className="text-sm text-muted dark:text-muted-dark">
          Próximo passo atual: {selectedTask.nextAction}
        </p>
      ) : null}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">O que está travando?</legend>
        <div className="grid gap-2">
          {BLOCKAGE_OPTIONS.map((option) => (
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
                onChange={() =>
                  onChange({ blockageReason: option.value }, true)
                }
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Energia atual</legend>
        <div className="flex flex-wrap gap-2">
          {ENERGY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange({ currentEnergy: option.value }, true)}
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
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Tempo disponível</legend>
        <div className="flex flex-wrap gap-2">
          {AVAILABLE_MINUTE_CHIPS.map((minutes) => (
            <button
              key={minutes}
              type="button"
              disabled={disabled}
              onClick={() => onChange({ availableMinutes: minutes }, true)}
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
      </fieldset>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Detalhes (opcional)</span>
        <textarea
          value={fields.blockageDetails}
          maxLength={BLOCKAGE_DETAILS_MAX_LENGTH}
          disabled={disabled}
          onChange={(event) =>
            onChange({ blockageDetails: event.target.value }, true)
          }
          rows={3}
          className="w-full rounded-xl border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-brand dark:border-line-dark"
        />
      </label>

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
