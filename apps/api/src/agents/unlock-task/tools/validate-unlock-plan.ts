import {
  MAX_RECOMMENDED_FOCUS_MINUTES,
  MAX_UNLOCK_PLAN_STEPS,
  MIN_RECOMMENDED_FOCUS_MINUTES,
  MIN_UNLOCK_PLAN_STEPS,
  UnlockPlanSchema,
  type UnlockPlan,
  type UnlockTaskRunRequest,
} from '@destravai/contracts'
import { hashUnlockPlan } from '../plan-hash.js'
import type { UnlockRunContext } from '../context.js'

const ACTION_VERBS =
  /^(abrir|escrever|listar|criar|revisar|separar|ler|anotar|escolher|definir|rascunhar|organizar|enviar|ligar|pesquisar|marcar|copiar|colar|salvar|iniciar|comecar|começar|open|write|list|create|draft|read|pick|choose|send|call|search|save|start|outline|sketch)\b/i

const MEDICAL_TERMS =
  /\b(diagn[oó]stico|depress[aã]o|ansiedade generalizada|tdah|transtorno|medicamento|rem[eé]dio|prescrev|terapia cognitiva|psic[oó]logo|psiquiatra|antidepressiv|ansiol[ií]tico|ssri|dose|mg\b|tratamento cl[ií]nico|self-harm|suicid)/i

export interface PlanValidationResult {
  valid: boolean
  errors: string[]
  planHash: string | null
}

export function validateUnlockPlanDeterministic(
  plan: UnlockPlan,
  request: UnlockTaskRunRequest,
): PlanValidationResult {
  const errors: string[] = []
  const parsed = UnlockPlanSchema.safeParse(plan)

  if (!parsed.success) {
    return { valid: false, errors: ['plan_schema_invalid'], planHash: null }
  }

  const value = parsed.data

  if (
    value.steps.length < MIN_UNLOCK_PLAN_STEPS ||
    value.steps.length > MAX_UNLOCK_PLAN_STEPS
  ) {
    errors.push('step_count')
  }

  const sequential = value.steps.every((step, index) => step.order === index + 1)
  if (!sequential) {
    errors.push('step_order')
  }

  if (value.steps.some((step) => !Number.isInteger(step.minutes) || step.minutes < 1)) {
    errors.push('step_minutes')
  }

  const sum = value.steps.reduce((total, step) => total + step.minutes, 0)
  if (sum !== value.totalMinutes) {
    errors.push('total_mismatch')
  }

  if (value.totalMinutes > request.availableMinutes) {
    errors.push('over_available_time')
  }

  if (
    value.recommendedFocusMinutes < MIN_RECOMMENDED_FOCUS_MINUTES ||
    value.recommendedFocusMinutes > MAX_RECOMMENDED_FOCUS_MINUTES ||
    value.recommendedFocusMinutes > request.availableMinutes
  ) {
    errors.push('focus_minutes')
  }

  if (value.steps.some((step) => step.title.trim().length === 0)) {
    errors.push('empty_title')
  }

  const first = value.steps[0]
  if (!first || !ACTION_VERBS.test(first.title.trim())) {
    errors.push('first_step_not_concrete')
  }

  const haystack = [
    value.title,
    value.summary,
    value.nextAction,
    value.supportiveMessage,
    ...value.steps.map((step) => step.title),
  ].join(' ')

  if (MEDICAL_TERMS.test(haystack)) {
    errors.push('medical_content')
  }

  if (errors.length > 0) {
    return { valid: false, errors, planHash: null }
  }

  return {
    valid: true,
    errors: [],
    planHash: hashUnlockPlan(value),
  }
}

export function applyValidatedPlan(
  context: UnlockRunContext,
  plan: UnlockPlan,
): PlanValidationResult {
  const result = validateUnlockPlanDeterministic(plan, context.request)
  context.protocol.push('validate_unlock_plan')
  context.validatedPlanHash = result.planHash
  return result
}
