import type { EnergyLevel, UnlockPlan, UnlockTaskRunRequest } from '@destravai/contracts'

export function splitMinutes(available: number): [number, number] {
  const budget = Number.isFinite(available) ? Math.max(0, Math.floor(available)) : 0

  if (budget < 2) {
    return [budget, 0]
  }

  const first = Math.max(1, Math.floor(budget / 2))
  return [first, budget - first]
}

function localize(locale: UnlockTaskRunRequest['locale'], pt: string, en: string) {
  return locale === 'en-US' ? en : pt
}

export function buildFallbackPlan(request: UnlockTaskRunRequest): UnlockPlan {
  const available = request.availableMinutes
  const energy: EnergyLevel = request.currentEnergy ?? request.task.energy ?? 'medium'
  const minutes = splitMinutes(available)
  const totalMinutes = minutes[0] + minutes[1]

  const first = localize(
    request.locale,
    'Abrir o material e escrever o primeiro item visível',
    'Open the material and write the first visible item',
  )
  const second = localize(
    request.locale,
    'Revisar o que foi escrito e marcar o próximo recorte',
    'Review what you wrote and mark the next slice',
  )
  const nextAction = request.task.nextAction?.trim() || first

  return {
    title: localize(request.locale, 'Começar agora', 'Start now'),
    summary: localize(
      request.locale,
      'Dois passos curtos para sair da paralisia.',
      'Two short steps to get moving.',
    ),
    nextAction: nextAction.slice(0, 160),
    steps: [
      { order: 1, title: first.slice(0, 80), minutes: minutes[0] },
      { order: 2, title: second.slice(0, 80), minutes: minutes[1] },
    ],
    totalMinutes,
    recommendedFocusMinutes: Math.min(60, Math.max(5, Math.min(available, totalMinutes))),
    energy,
    supportiveMessage: localize(
      request.locale,
      'Você não precisa terminar tudo. Só precisa começar.',
      'You do not need to finish everything. You only need to start.',
    ),
  }
}
