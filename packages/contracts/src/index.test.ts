import { describe, expect, it } from 'vitest'
import {
  ApiErrorResponseSchema,
  BLOCKAGE_DETAILS_MAX_LENGTH,
  HealthResponseSchema,
  TITLE_MAX_LENGTH,
  UnlockPlanSchema,
  UnlockTaskRunRequestSchema,
  UnlockTaskRunResponseSchema,
  publicValidationMessage,
  unknownFieldMessage,
} from './index'
import type { UnlockPlan, UnlockTaskRunRequest } from './index'

function validRequest(
  overrides: Record<string, unknown> = {},
): UnlockTaskRunRequest {
  return UnlockTaskRunRequestSchema.parse({
    clientRequestId: '550e8400-e29b-41d4-a716-446655440000',
    task: {
      id: 'task-1',
      title: 'Escrever testes da API',
      nextAction: null,
      energy: 'medium',
      estimatedMinutes: 25,
      status: 'inbox',
    },
    blockageReason: 'dont_know_where_to_start',
    blockageDetails: null,
    availableMinutes: 25,
    currentEnergy: 'low',
    today: {
      date: '2026-08-28',
      role: 'essential',
      plannedTaskCount: 1,
    },
    locale: 'pt-BR',
    ...overrides,
  })
}

function validPlan(overrides: Record<string, unknown> = {}): UnlockPlan {
  return UnlockPlanSchema.parse({
    nextAction: 'Abrir o arquivo de testes e escrever o primeiro caso',
    steps: [
      { order: 1, title: 'Abrir o arquivo', minutes: 5 },
      { order: 2, title: 'Escrever um teste', minutes: 15 },
    ],
    totalMinutes: 20,
    recommendedFocusMinutes: 25,
    energy: 'medium',
    supportiveMessage: 'Um passo pequeno ja conta.',
    ...overrides,
  })
}

function expectInvalid(
  schema: { safeParse: (data: unknown) => { success: boolean; error?: { issues: { message: string }[] } } },
  data: unknown,
) {
  const result = schema.safeParse(data)
  expect(result.success).toBe(false)
  if (!result.success) {
    for (const issue of result.error.issues) {
      expect([publicValidationMessage, unknownFieldMessage]).toContain(
        issue.message,
      )
    }
  }
}

describe('UnlockTaskRunRequestSchema', () => {
  it('accepts a valid request and normalizes the title', () => {
    const parsed = UnlockTaskRunRequestSchema.parse({
      clientRequestId: '550e8400-e29b-41d4-a716-446655440000',
      task: {
        id: 'task-1',
        title: '  Escrever testes  ',
        nextAction: null,
        energy: null,
        estimatedMinutes: null,
        status: 'active',
      },
      blockageReason: 'procrastinating',
      blockageDetails: 'Ja abri o editor duas vezes.',
      availableMinutes: 5,
      currentEnergy: null,
      today: {
        date: '2026-08-28',
        role: 'unplanned',
        plannedTaskCount: 0,
      },
      locale: 'en-US',
    })

    expect(parsed.task.title).toBe('Escrever testes')
    expect(parsed.availableMinutes).toBe(5)
  })

  it('rejects an invalid UUID', () => {
    expectInvalid(UnlockTaskRunRequestSchema, {
      ...validRequest(),
      clientRequestId: 'not-a-uuid',
    })
  })

  it('rejects an invalid task status', () => {
    expectInvalid(UnlockTaskRunRequestSchema, {
      ...validRequest(),
      task: {
        ...validRequest().task,
        status: 'done',
      },
    })
  })

  it('rejects available minutes outside the allowed range', () => {
    expectInvalid(UnlockTaskRunRequestSchema, {
      ...validRequest(),
      availableMinutes: 4,
    })
    expectInvalid(UnlockTaskRunRequestSchema, {
      ...validRequest(),
      availableMinutes: 121,
    })
  })

  it('rejects an invalid calendar date', () => {
    expectInvalid(UnlockTaskRunRequestSchema, {
      ...validRequest(),
      today: {
        date: '2026-02-29',
        role: 'essential',
        plannedTaskCount: 1,
      },
    })
    expectInvalid(UnlockTaskRunRequestSchema, {
      ...validRequest(),
      today: {
        date: '28-08-2026',
        role: 'essential',
        plannedTaskCount: 1,
      },
    })
  })

  it('rejects unknown fields', () => {
    expectInvalid(UnlockTaskRunRequestSchema, {
      ...validRequest(),
      extra: true,
    })
    expectInvalid(UnlockTaskRunRequestSchema, {
      ...validRequest(),
      task: {
        ...validRequest().task,
        secret: 'nope',
      },
    })
  })

  it('rejects text that exceeds max length', () => {
    expectInvalid(UnlockTaskRunRequestSchema, {
      ...validRequest(),
      task: {
        ...validRequest().task,
        title: 'a'.repeat(TITLE_MAX_LENGTH + 1),
      },
    })
    expectInvalid(UnlockTaskRunRequestSchema, {
      ...validRequest(),
      blockageDetails: 'b'.repeat(BLOCKAGE_DETAILS_MAX_LENGTH + 1),
    })
  })

  it('rejects a non-null nextAction on the task context', () => {
    expectInvalid(UnlockTaskRunRequestSchema, {
      ...validRequest(),
      task: {
        ...validRequest().task,
        nextAction: 'Ja sei o proximo passo',
      },
    })
  })
})

describe('UnlockPlanSchema', () => {
  it('accepts a plan with 2 to 4 sequential steps', () => {
    expect(validPlan().steps).toHaveLength(2)

    const fourSteps = validPlan({
      steps: [
        { order: 1, title: 'Passo um', minutes: 5 },
        { order: 2, title: 'Passo dois', minutes: 5 },
        { order: 3, title: 'Passo tres', minutes: 5 },
        { order: 4, title: 'Passo quatro', minutes: 5 },
      ],
      totalMinutes: 20,
    })
    expect(fourSteps.steps).toHaveLength(4)
  })

  it('rejects fewer than 2 steps', () => {
    expectInvalid(UnlockPlanSchema, {
      ...validPlan(),
      steps: [{ order: 1, title: 'So um', minutes: 5 }],
    })
  })

  it('rejects more than 4 steps', () => {
    expectInvalid(UnlockPlanSchema, {
      ...validPlan(),
      steps: [
        { order: 1, title: 'Um', minutes: 1 },
        { order: 2, title: 'Dois', minutes: 1 },
        { order: 3, title: 'Tres', minutes: 1 },
        { order: 4, title: 'Quatro', minutes: 1 },
        { order: 5, title: 'Cinco', minutes: 1 },
      ],
    })
  })

  it('rejects a non-sequential step order', () => {
    expectInvalid(UnlockPlanSchema, {
      ...validPlan(),
      steps: [
        { order: 1, title: 'Um', minutes: 5 },
        { order: 3, title: 'Tres', minutes: 5 },
      ],
    })
    expectInvalid(UnlockPlanSchema, {
      ...validPlan(),
      steps: [
        { order: 2, title: 'Dois', minutes: 5 },
        { order: 1, title: 'Um', minutes: 5 },
      ],
    })
  })

  it('rejects invalid minutes', () => {
    expectInvalid(UnlockPlanSchema, {
      ...validPlan(),
      steps: [
        { order: 1, title: 'Um', minutes: 0 },
        { order: 2, title: 'Dois', minutes: 5 },
      ],
    })
    expectInvalid(UnlockPlanSchema, {
      ...validPlan(),
      totalMinutes: 0,
    })
    expectInvalid(UnlockPlanSchema, {
      ...validPlan(),
      recommendedFocusMinutes: 4,
    })
    expectInvalid(UnlockPlanSchema, {
      ...validPlan(),
      recommendedFocusMinutes: 61,
    })
  })

  it('rejects unknown fields', () => {
    expectInvalid(UnlockPlanSchema, {
      ...validPlan(),
      model: 'gpt-4',
    })
  })
})

describe('UnlockTaskRunResponseSchema', () => {
  const createdAt = '2026-08-28T18:00:00.000Z'
  const runId = '11111111-1111-4111-8111-111111111111'

  it('accepts a completed response', () => {
    const parsed = UnlockTaskRunResponseSchema.parse({
      runId,
      status: 'completed',
      plan: validPlan(),
      promptVersion: 'unlock-v1',
      createdAt,
    })
    expect(parsed.status).toBe('completed')
  })

  it('accepts a needs_clarification response', () => {
    const parsed = UnlockTaskRunResponseSchema.parse({
      runId,
      status: 'needs_clarification',
      question: 'Quanto tempo voce tem agora de fato?',
      promptVersion: 'unlock-v1',
      createdAt,
    })
    expect(parsed.status).toBe('needs_clarification')
  })

  it('accepts a rejected response', () => {
    const parsed = UnlockTaskRunResponseSchema.parse({
      runId,
      status: 'rejected',
      reason: 'unsafe_input',
      message: 'Nao foi possivel continuar com esse pedido.',
      promptVersion: 'unlock-v1',
      createdAt,
    })
    expect(parsed.status).toBe('rejected')
  })

  it('rejects a completed response without a plan', () => {
    expectInvalid(UnlockTaskRunResponseSchema, {
      runId,
      status: 'completed',
      promptVersion: 'unlock-v1',
      createdAt,
    })
  })

  it('rejects an unknown status variant', () => {
    expectInvalid(UnlockTaskRunResponseSchema, {
      runId,
      status: 'running',
      promptVersion: 'unlock-v1',
      createdAt,
    })
  })
})

describe('ApiErrorResponseSchema', () => {
  it('accepts an error payload with optional details', () => {
    const parsed = ApiErrorResponseSchema.parse({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request',
        requestId: 'req-1',
        details: [{ path: 'availableMinutes', message: 'Invalid value' }],
      },
    })
    expect(parsed.error.details).toHaveLength(1)
  })

  it('rejects unknown fields', () => {
    expectInvalid(ApiErrorResponseSchema, {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        requestId: 'req-1',
        stack: 'Error: nope',
      },
    })
  })
})

describe('HealthResponseSchema', () => {
  it('accepts a health payload', () => {
    const parsed = HealthResponseSchema.parse({
      status: 'ok',
      service: 'destravai-api',
      version: '0.0.0',
      timestamp: '2026-08-28T18:00:00.000Z',
      requestId: 'req-1',
    })
    expect(parsed.status).toBe('ok')
  })
})
