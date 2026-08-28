import type { UnlockPlan, UnlockTaskRunRequest } from '@destravai/contracts'
import { validateUnlockPlanDeterministic } from '../tools/validate-unlock-plan.js'

const MEDICAL = /\b(diagn[oó]stico|medicamento|rem[eé]dio|terapeuta|prescrev)\b/i

export interface EvalMetrics {
  schemaValid: boolean
  stepCount: boolean
  sumMatches: boolean
  withinTime: boolean
  firstStepConcrete: boolean
  noMedicalTerms: boolean
  protocolComplete: boolean
  expectedLanguage: boolean
}

export function scoreUnlockPlan(
  plan: UnlockPlan,
  request: UnlockTaskRunRequest,
  extras: { protocolComplete: boolean; language: 'pt-BR' | 'en-US' },
): EvalMetrics {
  const validation = validateUnlockPlanDeterministic(plan, request)
  const haystack = [
    plan.title,
    plan.summary,
    plan.nextAction,
    ...plan.steps.map((step) => step.title),
  ].join(' ')

  const languageHint =
    extras.language === 'en-US'
      ? /\b(the|and|open|write|start)\b/i.test(haystack)
      : /\b(o|a|abrir|escrever|comecar|começar|passo)\b/i.test(haystack)

  return {
    schemaValid: validation.valid || !validation.errors.includes('plan_schema_invalid'),
    stepCount: plan.steps.length >= 2 && plan.steps.length <= 4,
    sumMatches:
      plan.steps.reduce((total, step) => total + step.minutes, 0) === plan.totalMinutes,
    withinTime: plan.totalMinutes <= request.availableMinutes,
    firstStepConcrete: !validation.errors.includes('first_step_not_concrete'),
    noMedicalTerms: !MEDICAL.test(haystack),
    protocolComplete: extras.protocolComplete,
    expectedLanguage: languageHint,
  }
}

export function metricsPassed(metrics: EvalMetrics) {
  return Object.values(metrics).every(Boolean)
}
