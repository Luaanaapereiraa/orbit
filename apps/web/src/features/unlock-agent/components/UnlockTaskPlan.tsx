'use client'

import type { UnlockTaskRunCompleted } from '@destravai/contracts'
import { Button } from '../../../components/ui/Button'

interface UnlockTaskPlanProps {
  response: UnlockTaskRunCompleted
  applied: boolean
  focusMinutes: number
  focusDisabled?: boolean
  onUsePlan: () => void
  onStartFocus: () => void
  onRetry: () => void
  onDismiss: () => void
}

export function UnlockTaskPlan({
  response,
  applied,
  focusMinutes,
  focusDisabled = false,
  onUsePlan,
  onStartFocus,
  onRetry,
  onDismiss,
}: UnlockTaskPlanProps) {
  const { plan, generationMode } = response

  return (
    <div className="space-y-4">
      {applied ? (
        <p className="text-sm font-medium text-brand-strong" role="status">
          Plano aplicado à tarefa.
        </p>
      ) : (
        <p className="text-sm text-muted dark:text-muted-dark">
          Isto é uma sugestão para esta tarefa. Nada muda até você escolher usar
          o plano.
        </p>
      )}

      {generationMode === 'fallback' ? (
        <p className="text-xs text-muted dark:text-muted-dark" role="status">
          Plano rápido gerado enquanto o assistente estava indisponível.
        </p>
      ) : null}

      <div>
        <h3 className="text-lg font-bold text-ink dark:text-ink-dark">
          {plan.title}
        </h3>
        <p className="mt-1 text-sm text-muted dark:text-muted-dark">
          {plan.summary}
        </p>
      </div>

      <p className="rounded-xl bg-brand/10 px-3 py-3 text-sm font-bold text-ink dark:text-ink-dark">
        Próxima ação: {plan.nextAction}
      </p>

      <ol className="space-y-2">
        {plan.steps.map((step) => (
          <li
            key={step.order}
            className="flex justify-between gap-3 rounded-xl border border-line px-3 py-2 text-sm dark:border-line-dark"
          >
            <span>
              {step.order}. {step.title}
            </span>
            <span className="shrink-0 text-muted dark:text-muted-dark">
              {step.minutes} min
            </span>
          </li>
        ))}
      </ol>

      <p className="text-sm text-muted dark:text-muted-dark">
        Total: {plan.totalMinutes} min. Foco recomendado:{' '}
        {plan.recommendedFocusMinutes} min. O timer usa a duração configurada (
        {focusMinutes} min).
      </p>
      <p className="text-sm text-ink dark:text-ink-dark">
        {plan.supportiveMessage}
      </p>

      <div className="flex flex-wrap gap-2">
        {!applied ? (
          <Button type="button" data-initial-focus="" onClick={onUsePlan}>
            Usar este plano
          </Button>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          disabled={focusDisabled}
          onClick={onStartFocus}
        >
          Começar foco
        </Button>
        <Button type="button" variant="ghost" onClick={onRetry}>
          Tentar de outro jeito
        </Button>
        <Button type="button" variant="ghost" onClick={onDismiss}>
          Agora não
        </Button>
      </div>
    </div>
  )
}
