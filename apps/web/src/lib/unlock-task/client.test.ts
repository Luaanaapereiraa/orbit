import { describe, expect, it, vi } from 'vitest'
import { UnlockTaskRunRequestSchema } from '@destravai/contracts'
import { requestUnlockTaskRun, UnlockTaskApiError } from './client'

const request = UnlockTaskRunRequestSchema.parse({
  clientRequestId: '550e8400-e29b-41d4-a716-446655440000',
  task: {
    id: 'task-1',
    title: 'Escrever testes',
    nextAction: null,
    energy: 'medium',
    estimatedMinutes: 25,
    status: 'active',
  },
  blockageReason: 'dont_know_where_to_start',
  blockageDetails: null,
  availableMinutes: 20,
  currentEnergy: 'low',
  today: {
    date: '2026-08-28',
    role: 'essential',
    plannedTaskCount: 1,
  },
  locale: 'pt-BR',
})

describe('unlock-task API client', () => {
  it('posts only to the unlock-task HTTP route with the user JWT', async () => {
    const fetchImpl = vi.fn(
      async (url: string, init?: Parameters<typeof fetch>[1]) => {
        expect(url).toBe('http://localhost:3333/v1/agents/unlock-task/runs')
        expect(init?.method).toBe('POST')
        expect(init?.headers).toMatchObject({
          authorization: 'Bearer user-jwt',
          'content-type': 'application/json',
        })
        expect(String(init?.body)).not.toMatch(/agent_runs|unlock_plans|rpc/i)
        return new Response(
          JSON.stringify({
            status: 'completed',
            runId: '550e8400-e29b-41d4-a716-446655440099',
            promptVersion: 'unlock-v1',
            generationMode: 'agent',
            createdAt: '2026-08-28T18:00:00.000Z',
            plan: {
              title: 'Comecar a apresentacao',
              summary: 'Dois passos pequenos para sair do zero.',
              nextAction: 'Abrir o arquivo e escrever o titulo',
              steps: [
                { order: 1, title: 'Abrir o arquivo', minutes: 5 },
                { order: 2, title: 'Escrever o titulo', minutes: 15 },
              ],
              totalMinutes: 20,
              recommendedFocusMinutes: 20,
              energy: 'medium',
              supportiveMessage: 'Um passo pequeno ja conta.',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      },
    )

    const result = await requestUnlockTaskRun(request, 'user-jwt', fetchImpl)
    expect(result.status).toBe('completed')
    if (result.status === 'completed') {
      expect(result.generationMode).toBe('agent')
    }
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('maps quota errors without leaking persistence details', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              code: 'AGENT_QUOTA_EXCEEDED',
              message: 'Daily agent limit reached',
              requestId: 'req-1',
            },
          }),
          { status: 429, headers: { 'content-type': 'application/json' } },
        ),
    )

    await expect(
      requestUnlockTaskRun(request, 'user-jwt', fetchImpl),
    ).rejects.toMatchObject({
      name: 'UnlockTaskApiError',
      code: 'AGENT_QUOTA_EXCEEDED',
    })
    await expect(
      requestUnlockTaskRun(request, 'user-jwt', fetchImpl),
    ).rejects.toBeInstanceOf(UnlockTaskApiError)
  })
})
