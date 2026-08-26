import {
  eachDayOfInterval,
  endOfWeek,
  format,
  isSameDay,
  startOfDay,
  startOfWeek,
} from 'date-fns'
import ptBR from 'date-fns/locale/pt-BR'
import { useMemo } from 'react'
import { usePomodoro } from '../../contexts/PomodoroContext'
import { Card } from '../../components/ui/Card'
import { focusedMinutesOf } from '../../lib/stats'

export function Stats() {
  const { cycles } = usePomodoro()
  const today = startOfDay(new Date())
  const weekStart = startOfWeek(today, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 })

  const focusCycles = cycles.filter((cycle) => cycle.type === 'focus')
  const completed = focusCycles.filter((cycle) => cycle.finishedDate).length
  const interrupted = focusCycles.filter(
    (cycle) => cycle.interruptedDate,
  ).length

  const minutesToday = focusCycles
    .filter((cycle) => isSameDay(new Date(cycle.startDate), today))
    .reduce((total, cycle) => total + focusedMinutesOf(cycle), 0)

  const minutesWeek = focusCycles
    .filter((cycle) => {
      const start = new Date(cycle.startDate)
      return start >= weekStart && start <= weekEnd
    })
    .reduce((total, cycle) => total + focusedMinutesOf(cycle), 0)

  const days = useMemo(
    () => eachDayOfInterval({ start: weekStart, end: weekEnd }),
    [weekStart, weekEnd],
  )

  const bars = days.map((day) => {
    const minutes = focusCycles
      .filter((cycle) => isSameDay(new Date(cycle.startDate), day))
      .reduce((total, cycle) => total + focusedMinutesOf(cycle), 0)

    return {
      label: format(day, 'EEE', { locale: ptBR }),
      minutes,
    }
  })

  const maxMinutes = Math.max(...bars.map((bar) => bar.minutes), 1)

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-ink dark:text-ink-dark">
        Estatísticas
      </h1>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Foco hoje" value={`${minutesToday} min`} />
        <StatCard label="Foco na semana" value={`${minutesWeek} min`} />
        <StatCard
          label="Ciclos de foco"
          value={`${completed} concluídos`}
          hint={`${interrupted} interrompidos`}
        />
      </div>

      <Card>
        <h2 className="mb-6 font-bold text-ink dark:text-ink-dark">
          Minutos por dia
        </h2>
        <div className="flex h-48 items-end gap-3">
          {bars.map((bar) => (
            <div
              key={bar.label}
              className="flex flex-1 flex-col items-center gap-2"
            >
              <div className="flex h-36 w-full items-end rounded-xl bg-canvas dark:bg-canvas-dark">
                <div
                  className="w-full rounded-xl bg-brand"
                  style={{
                    height: `${Math.max(
                      (bar.minutes / maxMinutes) * 100,
                      bar.minutes > 0 ? 8 : 0,
                    )}%`,
                  }}
                  title={`${bar.minutes} min`}
                />
              </div>
              <span className="text-xs font-medium uppercase text-muted dark:text-muted-dark">
                {bar.label}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <Card>
      <p className="text-sm text-muted dark:text-muted-dark">{label}</p>
      <p className="mt-2 text-2xl font-bold text-ink dark:text-ink-dark">
        {value}
      </p>
      {hint && (
        <p className="mt-1 text-xs text-muted dark:text-muted-dark">{hint}</p>
      )}
    </Card>
  )
}
