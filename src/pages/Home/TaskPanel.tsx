import { FormEvent, useState } from 'react'
import { Plus, Trash } from 'phosphor-react'
import { usePomodoro } from '../../contexts/PomodoroContext'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { cn } from '../../lib/cn'

export function TaskPanel() {
  const {
    tasks,
    selectedTaskId,
    addTask,
    selectTask,
    deleteTask,
    activeCycle,
  } = usePomodoro()
  const [name, setName] = useState('')
  const isLocked = !!activeCycle && activeCycle.type === 'focus'

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    addTask(name)
    setName('')
  }

  return (
    <Card className="flex h-full flex-col">
      <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
        Tarefas
      </h2>
      <p className="mt-1 text-sm text-zinc-500">
        Selecione em qual tarefa você vai focar.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Nova tarefa"
          className="h-11 flex-1 rounded-xl border border-zinc-200 bg-transparent px-3 text-sm text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:text-zinc-100"
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
        {tasks.length === 0 && (
          <li className="rounded-xl border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-700">
            Nenhuma tarefa ainda. Crie a primeira para começar.
          </li>
        )}

        {tasks.map((task) => {
          const selected = task.id === selectedTaskId

          return (
            <li key={task.id}>
              <div
                className={cn(
                  'flex items-center gap-2 rounded-xl border px-3 py-2',
                  selected
                    ? 'border-emerald-500 bg-emerald-500/10'
                    : 'border-zinc-200 dark:border-zinc-800',
                )}
              >
                <button
                  type="button"
                  disabled={isLocked}
                  onClick={() => selectTask(task.id)}
                  className="flex-1 truncate text-left text-sm font-medium text-zinc-800 disabled:opacity-60 dark:text-zinc-100"
                >
                  {task.name}
                </button>
                <button
                  type="button"
                  onClick={() => deleteTask(task.id)}
                  className="rounded-lg p-2 text-zinc-400 hover:bg-red-500/10 hover:text-red-500"
                  aria-label={`Excluir ${task.name}`}
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
