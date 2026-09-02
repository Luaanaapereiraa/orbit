'use client'

import { type FormEvent, useState } from 'react'
import { Plus, Trash } from '@phosphor-icons/react'
import { tasksForCommonList, type Task } from '@destravai/core'
import { usePomodoro } from '../../contexts/PomodoroContext'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { cn } from '../../lib/cn'

interface TaskPanelProps {
  onUnlock: (task: Task) => void
}

export function TaskPanel({ onUnlock }: TaskPanelProps) {
  const {
    tasks,
    selectedTaskId,
    addTask,
    selectTask,
    deleteTask,
    activeCycle,
  } = usePomodoro()
  const [name, setName] = useState('')
  const visibleTasks = tasksForCommonList(tasks)
  const isLocked = !!activeCycle && activeCycle.type === 'focus'

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    addTask(name)
    setName('')
  }

  return (
    <Card className="flex h-full flex-col">
      <h2 className="text-lg font-bold text-ink dark:text-ink-dark">Tarefas</h2>
      <p className="mt-1 text-sm text-muted dark:text-muted-dark">
        Selecione em qual tarefa você vai focar.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Nova tarefa"
          className="h-11 flex-1 rounded-xl border border-line bg-transparent px-3 text-sm text-ink outline-none focus:border-brand dark:border-line-dark dark:text-ink-dark"
        />
        <Button
          type="submit"
          className="h-11 w-11 px-0"
          disabled={!name.trim()}
          aria-label="Adicionar tarefa"
        >
          <Plus size={18} />
        </Button>
      </form>

      <ul className="mt-4 flex-1 space-y-2 overflow-auto">
        {visibleTasks.length === 0 && (
          <li className="rounded-xl border border-dashed border-line p-4 text-sm text-muted dark:border-line-dark dark:text-muted-dark">
            Nenhuma tarefa ainda. Crie a primeira para começar.
          </li>
        )}

        {visibleTasks.map((task) => {
          const selected = task.id === selectedTaskId

          return (
            <li key={task.id}>
              <div
                className={cn(
                  'flex items-center gap-2 rounded-xl border px-3 py-2',
                  selected
                    ? 'border-brand bg-brand/10'
                    : 'border-line dark:border-line-dark',
                )}
              >
                <button
                  type="button"
                  disabled={isLocked}
                  onClick={() => selectTask(task.id)}
                  className="flex-1 truncate text-left text-sm font-medium text-ink disabled:opacity-60 dark:text-ink-dark"
                >
                  {task.title}
                </button>
                <button
                  type="button"
                  onClick={() => onUnlock(task)}
                  className="rounded-lg px-2 py-2 text-xs font-bold text-brand hover:bg-brand/10"
                >
                  Travei
                </button>
                <button
                  type="button"
                  onClick={() => deleteTask(task.id)}
                  className="rounded-lg p-2 text-muted hover:bg-danger/10 hover:text-danger dark:text-muted-dark"
                  aria-label={`Excluir ${task.title}`}
                >
                  <Trash size={16} />
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
