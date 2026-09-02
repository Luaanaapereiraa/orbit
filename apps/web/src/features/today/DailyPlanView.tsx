'use client'

import { useState } from 'react'
import {
  getDailyPlanByDate,
  resolvePlanTasks,
  type Task,
} from '@destravai/core'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { usePomodoro } from '../../contexts/PomodoroContext'
import { EssentialTaskCard, SecondaryTaskCard } from './TaskPlanCard'
import { PlanDayDialog } from './PlanDayDialog'

interface DailyPlanViewProps {
  dateKey: string
  onEdit: (task: Task) => void
  onUnlock: (task: Task) => void
  onCompleted: (title: string) => void
}

export function DailyPlanView({
  dateKey,
  onEdit,
  onUnlock,
  onCompleted,
}: DailyPlanViewProps) {
  const { dailyPlans, tasks } = usePomodoro()
  const [plannerOpen, setPlannerOpen] = useState(false)
  const plan = getDailyPlanByDate(dailyPlans, dateKey)
  const resolved = plan
    ? resolvePlanTasks(plan, tasks)
    : { essential: null, secondaries: [] }
  const hasItems = !!resolved.essential || resolved.secondaries.length > 0
  const canFillEssential = !resolved.essential
  const canFillSecondary = resolved.secondaries.length < 2

  return (
    <div className="space-y-4">
      {!hasItems && (
        <Card className="space-y-3">
          <h2 className="text-lg font-bold text-ink dark:text-ink-dark">
            Seu dia ainda está aberto.
          </h2>
          <p className="text-sm text-muted dark:text-muted-dark">
            Escolha uma coisa essencial e, se quiser, até duas secundárias.
          </p>
          <Button className="h-11" onClick={() => setPlannerOpen(true)}>
            Planejar meu dia
          </Button>
        </Card>
      )}

      {resolved.essential && (
        <EssentialTaskCard
          task={resolved.essential}
          dateKey={dateKey}
          onEdit={onEdit}
          onUnlock={onUnlock}
          onCompleted={onCompleted}
        />
      )}

      {resolved.secondaries.map((task) => (
        <SecondaryTaskCard
          key={task.id}
          task={task}
          dateKey={dateKey}
          onEdit={onEdit}
          onUnlock={onUnlock}
          onCompleted={onCompleted}
        />
      ))}

      {hasItems && (canFillEssential || canFillSecondary) && (
        <Button
          variant="secondary"
          className="h-11"
          onClick={() => setPlannerOpen(true)}
        >
          Completar o plano
        </Button>
      )}

      {hasItems && !canFillEssential && !canFillSecondary && (
        <Button
          variant="ghost"
          className="h-11"
          onClick={() => setPlannerOpen(true)}
        >
          Ajustar o plano
        </Button>
      )}

      <PlanDayDialog
        open={plannerOpen}
        dateKey={dateKey}
        onClose={() => setPlannerOpen(false)}
      />
    </div>
  )
}
