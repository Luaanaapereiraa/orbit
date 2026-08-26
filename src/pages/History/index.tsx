import { formatDistanceToNow } from 'date-fns'
import ptBR from 'date-fns/locale/pt-BR'
import { useMemo, useState } from 'react'
import { usePomodoro } from '../../contexts/PomodoroContext'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { CycleType } from '../../reducers/pomodoro/types'
import { cn } from '../../lib/cn'

const typeLabels: Record<CycleType, string> = {
  focus: 'Foco',
  shortBreak: 'Pausa curta',
  longBreak: 'Pausa longa',
}

type Filter = 'all' | CycleType

export function History() {
  const { cycles, clearHistory, activeCycleId } = usePomodoro()
  const [filter, setFilter] = useState<Filter>('all')
  const orderedCycles = [...cycles].reverse()
  const visibleCycles = orderedCycles.filter((cycle) =>
    filter === 'all' ? true : cycle.type === filter,
  )
  const hasPastCycles = cycles.some((cycle) => cycle.id !== activeCycleId)
  const filters = useMemo(
    () =>
      [
        { id: 'all' as const, label: 'Todos' },
        { id: 'focus' as const, label: 'Foco' },
        { id: 'shortBreak' as const, label: 'Pausa curta' },
        { id: 'longBreak' as const, label: 'Pausa longa' },
      ],
    [],
  )

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Meu histórico
        </h1>
        {hasPastCycles && (
          <Button variant="ghost" onClick={clearHistory}>
            Limpar histórico
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {filters.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={cn(
              'rounded-full px-3 py-1 text-sm font-medium',
              filter === item.id
                ? 'bg-emerald-500 text-white'
                : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {visibleCycles.length === 0 ? (
        <Card className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
            Nenhum ciclo registrado ainda.
          </p>
          <span className="mt-1 text-sm text-zinc-500">
            Comece um pomodoro na página do timer para ver o histórico aqui.
          </span>
        </Card>
      ) : (
        <Card className="overflow-auto p-0">
          <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
            <thead className="bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              <tr>
                <th className="px-6 py-3 font-medium">Tarefa</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Duração</th>
                <th className="px-4 py-3 font-medium">Início</th>
                <th className="px-6 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {visibleCycles.map((cycle) => (
                <tr
                  key={cycle.id}
                  className="border-t border-zinc-100 dark:border-zinc-800"
                >
                  <td className="px-6 py-3 text-zinc-900 dark:text-zinc-100">
                    {cycle.task || '—'}
                  </td>
                  <td className="px-4 py-3 text-zinc-500">
                    {typeLabels[cycle.type]}
                  </td>
                  <td className="px-4 py-3 text-zinc-500">
                    {cycle.minutesAmount} min
                  </td>
                  <td className="px-4 py-3 text-zinc-500">
                    {formatDistanceToNow(new Date(cycle.startDate), {
                      addSuffix: true,
                      locale: ptBR,
                    })}
                  </td>
                  <td className="px-6 py-3">
                    <Status cycle={cycle} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}

function Status({
  cycle,
}: {
  cycle: {
    finishedDate?: Date
    interruptedDate?: Date
    pausedAt?: Date
  }
}) {
  if (cycle.finishedDate) {
    return <StatusDot color="bg-emerald-500" label="Concluído" />
  }

  if (cycle.interruptedDate) {
    return <StatusDot color="bg-red-500" label="Interrompido" />
  }

  if (cycle.pausedAt) {
    return <StatusDot color="bg-amber-500" label="Pausado" />
  }

  return <StatusDot color="bg-amber-400" label="Em andamento" />
}

function StatusDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-zinc-700 dark:text-zinc-200">
      <span className={cn('h-2 w-2 rounded-full', color)} />
      {label}
    </span>
  )
}
